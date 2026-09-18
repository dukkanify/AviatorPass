/**
 * Chief Ground Instructor — ATPL journey orchestration (CR004).
 */

import { generateId } from "@/lib/security/crypto";
import {
  ATPL_PACKAGE_CONFIRMED_NOTICE,
  ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
  ATPL_PACKAGE_FIRST_LECTURE_TITLE,
  ATPL_PACKAGE_TKI_NOTICE,
  EMPTY_ATPL_PACKAGE_SCHEDULE,
  combineLocalDateAndTime,
  formatAtplPackageScheduleLabel,
  type AtplPackageScheduleSnapshot,
} from "@/constants/atpl-complete-package";
import { DEFAULT_CLASS_DURATION_MINUTES } from "@/constants/classes";
import { ROLES } from "@/constants/roles";
import { findUserById, readAuthDb } from "@/services/auth/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb } from "@/services/courses/store";
import {
  listStudentEnrollments,
  updateEnrollmentStatus,
} from "@/services/courses/enrollment-service";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import {
  createLiveClass,
  enrollStudentsInLiveClass,
  getLiveClass,
  rescheduleLiveClass,
  canManageClass,
} from "@/services/classes/class-service";
import { ClassValidationError } from "@/services/classes/validation";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { readClassesDb } from "@/services/classes/store";
import { readCgiDb, writeCgiDb } from "@/services/cgi/store";
import type {
  AtplLectureAssignment,
  AtplSubjectAssignment,
  AtplSubjectDistributionStatus,
  CgiOversightNote,
} from "@/types/cgi";

export class CgiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CgiError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function audit(
  action: string,
  actorId: string | null,
  entityType: string,
  entityId: string | null,
  detail: string,
) {
  writeCgiDb((db) => {
    db.audit.unshift({
      id: generateId(),
      action,
      actorId,
      entityType,
      entityId,
      detail,
      createdAt: nowIso(),
    });
    db.audit = db.audit.slice(0, 500);
  });
}

export function listAtplCourses() {
  ensureCoursesSeeded();
  return readCoursesDb()
    .courses.filter((c) => !c.deletedAt && /^ATPL-/i.test(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      primaryInstructorId: c.primaryInstructorId,
      status: c.status,
      subjectCode: typeof c.metadata?.subjectCode === "string" ? c.metadata.subjectCode : c.code,
    }));
}

export function getAtplPackageProduct() {
  ensurePaymentsSeeded();
  return readPaymentsDb().products.find((p) => p.metadata?.sku === "ATPL-PACKAGE") ?? null;
}

export function getJourneySettings() {
  return readCgiDb().settings;
}

export function setDefaultFirstSubject(input: {
  courseId: string;
  actorId: string;
}): ReturnType<typeof getJourneySettings> {
  const course = listAtplCourses().find((c) => c.id === input.courseId);
  if (!course) throw new CgiError("ATPL subject course not found", 404);

  writeCgiDb((db) => {
    db.settings.defaultFirstSubjectCourseId = input.courseId;
    db.settings.updatedAt = nowIso();
    db.settings.updatedById = input.actorId;
  });
  audit(
    "cgi.first_subject.default",
    input.actorId,
    "course",
    input.courseId,
    `Default first subject → ${course.code}`,
  );
  return getJourneySettings();
}

/** CR010 — patch CGI journey settings from Automation Center. */
export function updateJourneySettings(input: {
  patch: Partial<{ defaultFirstSubjectCourseId: string | null; packageSku: string }>;
  actorId: string;
}): ReturnType<typeof getJourneySettings> {
  if (
    input.patch.defaultFirstSubjectCourseId !== undefined &&
    input.patch.defaultFirstSubjectCourseId
  ) {
    return setDefaultFirstSubject({
      courseId: input.patch.defaultFirstSubjectCourseId,
      actorId: input.actorId,
    });
  }
  writeCgiDb((db) => {
    if (input.patch.packageSku !== undefined) {
      db.settings.packageSku = String(input.patch.packageSku).trim() || db.settings.packageSku;
    }
    if (input.patch.defaultFirstSubjectCourseId === null) {
      db.settings.defaultFirstSubjectCourseId = null;
    }
    db.settings.updatedAt = nowIso();
    db.settings.updatedById = input.actorId;
  });
  audit("cgi.settings.update", input.actorId, "settings", "journey", "Automation Center patch");
  return getJourneySettings();
}

/** Ensure a student has an ordered ATPL subject distribution (seeded from package courses). */
export function ensureStudentSubjectPlan(
  studentId: string,
  actorId: string | null,
): AtplSubjectAssignment[] {
  const existing = readCgiDb().subjectAssignments.filter((a) => a.studentId === studentId);
  if (existing.length) return existing.sort((a, b) => a.sortOrder - b.sortOrder);

  const courses = listAtplCourses();
  if (!courses.length) return [];

  const settings = getJourneySettings();
  const firstId = settings.defaultFirstSubjectCourseId ?? courses[0]!.id;
  const ordered = [
    ...courses.filter((c) => c.id === firstId),
    ...courses.filter((c) => c.id !== firstId),
  ];

  const stamp = nowIso();
  const rows: AtplSubjectAssignment[] = ordered.map((c, idx) => ({
    id: generateId(),
    studentId,
    courseId: c.id,
    subjectCode: c.subjectCode,
    sortOrder: idx + 1,
    status: (idx === 0 ? "available" : "locked") as AtplSubjectDistributionStatus,
    assignedInstructorId: c.primaryInstructorId,
    unlockedAt: idx === 0 ? stamp : null,
    completedAt: null,
    notes: null,
    assignedById: actorId,
    createdAt: stamp,
    updatedAt: stamp,
  }));

  writeCgiDb((db) => {
    db.subjectAssignments.push(...rows);
  });
  audit("cgi.subjects.seed", actorId, "student", studentId, `Seeded ${rows.length} ATPL subjects`);
  return rows;
}

export function listStudentSubjectPlan(studentId: string): AtplSubjectAssignment[] {
  return readCgiDb()
    .subjectAssignments.filter((a) => a.studentId === studentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function distributeSubjects(input: {
  studentId: string;
  courseIds: string[];
  firstCourseId?: string | null;
  actorId: string;
}): AtplSubjectAssignment[] {
  const student = findUserById(input.studentId);
  if (!student || student.role !== ROLES.STUDENT) {
    throw new CgiError("Student not found", 404);
  }
  const atpl = listAtplCourses();
  const byId = new Map(atpl.map((c) => [c.id, c]));
  for (const id of input.courseIds) {
    if (!byId.has(id)) throw new CgiError(`Not an ATPL subject: ${id}`);
  }

  const firstId = input.firstCourseId ?? input.courseIds[0] ?? null;
  if (firstId && !input.courseIds.includes(firstId)) {
    throw new CgiError("First subject must be included in the distribution list");
  }

  const ordered = firstId
    ? [firstId, ...input.courseIds.filter((id) => id !== firstId)]
    : [...input.courseIds];

  const stamp = nowIso();
  writeCgiDb((db) => {
    db.subjectAssignments = db.subjectAssignments.filter((a) => a.studentId !== input.studentId);
    ordered.forEach((courseId, idx) => {
      const course = byId.get(courseId)!;
      db.subjectAssignments.push({
        id: generateId(),
        studentId: input.studentId,
        courseId,
        subjectCode: course.subjectCode,
        sortOrder: idx + 1,
        status: idx === 0 ? "available" : "locked",
        assignedInstructorId: course.primaryInstructorId,
        unlockedAt: idx === 0 ? stamp : null,
        completedAt: null,
        notes: null,
        assignedById: input.actorId,
        createdAt: stamp,
        updatedAt: stamp,
      });
    });
  });

  audit(
    "cgi.subjects.distribute",
    input.actorId,
    "student",
    input.studentId,
    `Distributed ${ordered.length} subjects; first=${firstId ?? "n/a"}`,
  );
  return listStudentSubjectPlan(input.studentId);
}

export async function chooseFirstSubject(input: {
  studentId: string;
  courseId: string;
  actorId: string;
}): Promise<AtplSubjectAssignment[]> {
  let plan = listStudentSubjectPlan(input.studentId);
  if (!plan.length) {
    plan = ensureStudentSubjectPlan(input.studentId, input.actorId);
  }
  if (!plan.some((p) => p.courseId === input.courseId)) {
    throw new CgiError("Subject is not on this student's ATPL plan", 404);
  }

  const stamp = nowIso();
  writeCgiDb((db) => {
    const rows = db.subjectAssignments
      .filter((a) => a.studentId === input.studentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const target = rows.find((r) => r.courseId === input.courseId);
    if (!target) return;
    const rest = rows.filter((r) => r.id !== target.id);
    const reordered = [target, ...rest];
    reordered.forEach((row, idx) => {
      row.sortOrder = idx + 1;
      row.updatedAt = stamp;
      if (idx === 0) {
        if (row.status === "locked") row.status = "available";
        row.unlockedAt = row.unlockedAt ?? stamp;
      } else if (row.status === "available" && !row.completedAt) {
        row.status = "locked";
        row.unlockedAt = null;
      }
    });
  });

  // Unlock enrollment for first subject; suspend others that were auto-granted.
  const enrollments = listStudentEnrollments(input.studentId);
  for (const row of listStudentSubjectPlan(input.studentId)) {
    const enrollment = enrollments.find((e) => e.courseId === row.courseId);
    if (!enrollment) continue;
    if (row.sortOrder === 1 && enrollment.status === "suspended") {
      await updateEnrollmentStatus({
        id: enrollment.id,
        status: "approved",
        actorId: input.actorId,
      });
    } else if (row.sortOrder > 1 && row.status === "locked" && enrollment.status === "approved") {
      await updateEnrollmentStatus({
        id: enrollment.id,
        status: "suspended",
        actorId: input.actorId,
      });
    }
  }

  audit(
    "cgi.first_subject.student",
    input.actorId,
    "student",
    input.studentId,
    `First subject → ${input.courseId}`,
  );
  return listStudentSubjectPlan(input.studentId);
}

export async function changeSubjectInstructor(input: {
  courseId: string;
  instructorId: string;
  studentId?: string | null;
  actorId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const instructor = findUserById(input.instructorId);
  if (!instructor || instructor.role !== ROLES.INSTRUCTOR) {
    throw new CgiError("Instructor not found", 404);
  }
  const course = listAtplCourses().find((c) => c.id === input.courseId);
  if (!course) throw new CgiError("ATPL subject not found", 404);

  // CR005 — route through Assignment Engine (reassign + conflict-aware moves).
  const { reassignInstructorEngine } = await import("@/services/assignment/engine");
  await reassignInstructorEngine({
    courseId: input.courseId,
    instructorId: input.instructorId,
    studentId: input.studentId,
    moveFutureClasses: true,
    actorId: input.actorId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  writeCgiDb((db) => {
    for (const row of db.subjectAssignments) {
      if (row.courseId !== input.courseId) continue;
      if (input.studentId && row.studentId !== input.studentId) continue;
      row.assignedInstructorId = input.instructorId;
      row.updatedAt = nowIso();
    }
  });

  audit(
    "cgi.instructor.change",
    input.actorId,
    "course",
    input.courseId,
    `Primary instructor → ${instructor.email}`,
  );
  return listAtplCourses().find((c) => c.id === input.courseId)!;
}

export async function distributeLecture(input: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  instructorId: string;
  studentId?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
  actorId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AtplLectureAssignment> {
  const instructor = findUserById(input.instructorId);
  if (!instructor || instructor.role !== ROLES.INSTRUCTOR) {
    throw new CgiError("Instructor not found", 404);
  }
  if (!listAtplCourses().some((c) => c.id === input.courseId)) {
    throw new CgiError("ATPL subject not found", 404);
  }

  const stamp = nowIso();
  let liveClassId: string | null = null;

  // When a schedule time is provided, create the Live Class (Zoom + reminders).
  if (input.scheduledAt) {
    const created = await createLiveClass({
      title: input.lessonTitle.trim() || "ATPL Lecture",
      description: input.notes ?? "",
      courseId: input.courseId,
      lessonId: input.lessonId,
      instructorId: input.instructorId,
      startsAt: input.scheduledAt,
      durationMinutes: 60,
      enrollStudentIds: input.studentId ? [input.studentId] : undefined,
      actorId: input.actorId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    liveClassId = created?.id ?? null;
  }

  const row: AtplLectureAssignment = {
    id: generateId(),
    courseId: input.courseId,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle.trim() || "Lecture",
    instructorId: input.instructorId,
    studentId: input.studentId ?? null,
    status: input.scheduledAt ? "scheduled" : "assigned",
    scheduledAt: input.scheduledAt ?? null,
    liveClassId,
    notes: input.notes ?? null,
    assignedById: input.actorId,
    createdAt: stamp,
    updatedAt: stamp,
  };

  writeCgiDb((db) => {
    db.lectureAssignments.unshift(row);
  });
  audit("cgi.lectures.distribute", input.actorId, "lecture", row.id, row.lessonTitle);
  return row;
}

export function listLectureAssignments(filters?: {
  instructorId?: string;
  studentId?: string;
  courseId?: string;
}): AtplLectureAssignment[] {
  return readCgiDb()
    .lectureAssignments.filter((row) => {
      if (filters?.instructorId && row.instructorId !== filters.instructorId) return false;
      if (filters?.studentId && row.studentId !== filters.studentId) return false;
      if (filters?.courseId && row.courseId !== filters.courseId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function rescheduleAtplClass(input: {
  liveClassId: string;
  startsAt: string;
  endsAt: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  ensureClassesSeeded();
  // CGI may reschedule any class; instructors still limited by canManageClass.
  if (
    input.actorRole !== ROLES.CHIEF_GROUND_INSTRUCTOR &&
    input.actorRole !== ROLES.ADMIN &&
    input.actorRole !== ROLES.SUPER_ADMIN &&
    !canManageClass(input.actorId, input.actorRole, input.liveClassId)
  ) {
    throw new CgiError("Not allowed to reschedule this class", 403);
  }

  const result = await rescheduleLiveClass({
    id: input.liveClassId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    actorId: input.actorId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  if (!result) throw new CgiError("Failed to reschedule live class", 500);

  writeCgiDb((db) => {
    for (const lecture of db.lectureAssignments) {
      if (lecture.liveClassId === input.liveClassId) {
        lecture.liveClassId = result.id;
        lecture.scheduledAt = input.startsAt;
        lecture.status = "scheduled";
        lecture.updatedAt = nowIso();
      }
    }
  });

  audit(
    "cgi.schedule.reschedule",
    input.actorId,
    "live_class",
    result.id,
    `Rescheduled from ${input.liveClassId}`,
  );
  return result;
}

function latestPaidPackageOrder(studentId: string, email: string) {
  const needle = email.trim().toLowerCase();
  return (
    readPaymentsDb()
      .orders.filter(
        (order) =>
          order.status === "paid" &&
          Boolean(order.metadata?.purchaseFirst) &&
          typeof order.metadata?.studyStartDate === "string" &&
          (order.studentId === studentId ||
            order.studentEmail?.toLowerCase() === needle ||
            order.billingEmail?.toLowerCase() === needle),
      )
      .sort((a, b) => (b.paidAt ?? b.updatedAt).localeCompare(a.paidAt ?? a.updatedAt))[0] ?? null
  );
}

function packageScheduleFromOrder(
  order: NonNullable<ReturnType<typeof latestPaidPackageOrder>>,
): AtplPackageScheduleSnapshot {
  const requestedDate = String(
    order.metadata.requestedStudyStartDate ?? order.metadata.studyStartDate,
  );
  const requestedTime = String(
    order.metadata.requestedFirstLectureTime ?? order.metadata.firstLectureTime ?? "",
  );
  const currentDate = String(order.metadata.studyStartDate);
  const currentTime = String(order.metadata.firstLectureTime ?? "");
  const provisional = order.metadata.scheduleProvisional !== false;
  return {
    orderId: order.id,
    requestedStudyStartDate: requestedDate,
    requestedFirstLectureTime: requestedTime || null,
    requestedFirstLectureLabel:
      requestedDate && requestedTime
        ? formatAtplPackageScheduleLabel(requestedDate, requestedTime)
        : requestedDate,
    requestedFirstLectureAt:
      typeof order.metadata.firstLectureAt === "string" ? order.metadata.firstLectureAt : null,
    confirmedStudyStartDate: provisional ? null : currentDate,
    confirmedFirstLectureTime: provisional ? null : currentTime || null,
    confirmedFirstLectureLabel:
      !provisional && currentDate && currentTime
        ? formatAtplPackageScheduleLabel(currentDate, currentTime)
        : null,
    scheduleProvisional: provisional,
    scheduleNotice:
      typeof order.metadata.scheduleNotice === "string"
        ? order.metadata.scheduleNotice
        : provisional
          ? ATPL_PACKAGE_TKI_NOTICE
          : ATPL_PACKAGE_CONFIRMED_NOTICE,
    scheduleConfirmedAt:
      typeof order.metadata.scheduleConfirmedAt === "string"
        ? order.metadata.scheduleConfirmedAt
        : null,
    firstLectureLiveClassId:
      typeof order.metadata.firstLectureLiveClassId === "string"
        ? order.metadata.firstLectureLiveClassId
        : null,
  };
}

function latestPaidPackageSchedule(studentId: string, email: string): AtplPackageScheduleSnapshot {
  const order = latestPaidPackageOrder(studentId, email);
  if (!order) return EMPTY_ATPL_PACKAGE_SCHEDULE;
  return packageScheduleFromOrder(order);
}

export function getStudentAtplPackageSchedule(studentId: string, email: string) {
  return latestPaidPackageSchedule(studentId, email);
}

const FIRST_LECTURE_LESSON_ID = ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID;

function firstLectureInstructorIds(courseId: string, assignedId: string | null): string[] {
  const course = listAtplCourses().find((c) => c.id === courseId);
  const preferred = [assignedId, course?.primaryInstructorId].filter((id): id is string =>
    Boolean(id),
  );
  const rest = listAllInstructors()
    .map((i) => i.instructorId)
    .filter((id) => !preferred.includes(id));
  return [...new Set([...preferred, ...rest])];
}

function findSharedFirstLecture(startsAt: string, courseId: string) {
  ensureClassesSeeded();
  return (
    readClassesDb().classes.find(
      (row) =>
        !row.deletedAt &&
        row.status === "scheduled" &&
        row.courseId === courseId &&
        row.startsAt === startsAt &&
        row.title.startsWith(ATPL_PACKAGE_FIRST_LECTURE_TITLE),
    ) ?? null
  );
}

function upsertFirstLectureAssignment(input: {
  studentId: string;
  courseId: string;
  instructorId: string;
  scheduledAt: string;
  liveClassId: string;
  actorId: string;
  notes: string;
}) {
  const stamp = nowIso();
  writeCgiDb((db) => {
    const existing = db.lectureAssignments.find(
      (row) => row.studentId === input.studentId && row.lessonId === FIRST_LECTURE_LESSON_ID,
    );
    if (existing) {
      existing.courseId = input.courseId;
      existing.instructorId = input.instructorId;
      existing.scheduledAt = input.scheduledAt;
      existing.liveClassId = input.liveClassId;
      existing.status = "scheduled";
      existing.notes = input.notes;
      existing.updatedAt = stamp;
      return;
    }
    db.lectureAssignments.unshift({
      id: generateId(),
      courseId: input.courseId,
      lessonId: FIRST_LECTURE_LESSON_ID,
      lessonTitle: ATPL_PACKAGE_FIRST_LECTURE_TITLE,
      instructorId: input.instructorId,
      studentId: input.studentId,
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      liveClassId: input.liveClassId,
      notes: input.notes,
      assignedById: input.actorId,
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
}

async function placeConfirmedFirstLecture(input: {
  studentId: string;
  actorId: string;
  when: Date;
  existingLiveClassId?: string | null;
}): Promise<string> {
  const startsAt = input.when.toISOString();
  const endsAt = new Date(
    input.when.getTime() + DEFAULT_CLASS_DURATION_MINUTES * 60_000,
  ).toISOString();
  const plan = ensureStudentSubjectPlan(input.studentId, input.actorId);
  const first = plan[0];
  if (!first) throw new CgiError("No ATPL subject is available for the first lecture");
  const notes = ATPL_PACKAGE_CONFIRMED_NOTICE;
  const title = `${ATPL_PACKAGE_FIRST_LECTURE_TITLE} · ${first.subjectCode}`;

  const existingId = input.existingLiveClassId?.trim() || "";
  const existing = existingId ? getLiveClass(existingId) : null;
  if (existing && existing.status !== "cancelled" && !existing.deletedAt) {
    const moved = await rescheduleLiveClass({
      id: existing.id,
      startsAt,
      endsAt,
      actorId: input.actorId,
    });
    const liveClassId = moved?.id ?? existing.id;
    upsertFirstLectureAssignment({
      studentId: input.studentId,
      courseId: first.courseId,
      instructorId: moved?.instructorId ?? existing.instructorId,
      scheduledAt: startsAt,
      liveClassId,
      actorId: input.actorId,
      notes,
    });
    return liveClassId;
  }

  const shared = findSharedFirstLecture(startsAt, first.courseId);
  if (shared) {
    enrollStudentsInLiveClass(shared.id, [input.studentId]);
    upsertFirstLectureAssignment({
      studentId: input.studentId,
      courseId: first.courseId,
      instructorId: shared.instructorId,
      scheduledAt: startsAt,
      liveClassId: shared.id,
      actorId: input.actorId,
      notes,
    });
    return shared.id;
  }

  let lastError: string | null = null;
  for (const instructorId of firstLectureInstructorIds(
    first.courseId,
    first.assignedInstructorId,
  )) {
    try {
      const created = await createLiveClass({
        title,
        description: notes,
        courseId: first.courseId,
        lessonId: FIRST_LECTURE_LESSON_ID,
        instructorId,
        startsAt,
        durationMinutes: DEFAULT_CLASS_DURATION_MINUTES,
        enrollStudentIds: [input.studentId],
        actorId: input.actorId,
      });
      if (!created?.id) {
        lastError = "Could not create the live class";
        continue;
      }
      upsertFirstLectureAssignment({
        studentId: input.studentId,
        courseId: first.courseId,
        instructorId,
        scheduledAt: startsAt,
        liveClassId: created.id,
        actorId: input.actorId,
        notes,
      });
      return created.id;
    } catch (error) {
      if (error instanceof ClassValidationError || error instanceof CgiError) {
        lastError = error.message;
        continue;
      }
      throw error;
    }
  }

  throw new CgiError(lastError ?? "Could not book the first lecture. Choose a different time.");
}

export async function confirmAtplPackageSchedule(input: {
  studentId: string;
  actorId: string;
  studyStartDate?: string;
  firstLectureTime?: string;
}) {
  const student = findUserById(input.studentId);
  if (!student) throw new CgiError("Student not found", 404);
  const order = latestPaidPackageOrder(input.studentId, student.email);
  if (!order) throw new CgiError("No ATPL package schedule to confirm", 404);

  const requestedDate = String(
    order.metadata.requestedStudyStartDate ?? order.metadata.studyStartDate,
  );
  const requestedTime = String(
    order.metadata.requestedFirstLectureTime ?? order.metadata.firstLectureTime ?? "",
  );
  const studyStartDate = (input.studyStartDate ?? requestedDate).trim();
  const firstLectureTime = (input.firstLectureTime ?? requestedTime).trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(studyStartDate) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(firstLectureTime)
  ) {
    throw new CgiError("Enter a valid study start date and first-lecture time");
  }
  const when = combineLocalDateAndTime(studyStartDate, firstLectureTime);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    throw new CgiError("Confirmed first lecture must be in the future");
  }

  const liveClassId = await placeConfirmedFirstLecture({
    studentId: input.studentId,
    actorId: input.actorId,
    when,
    existingLiveClassId:
      typeof order.metadata.firstLectureLiveClassId === "string"
        ? order.metadata.firstLectureLiveClassId
        : null,
  });

  const stamp = nowIso();
  writePaymentsDb((db) => {
    const row = db.orders.find((item) => item.id === order.id);
    if (!row) return;
    row.metadata = {
      ...row.metadata,
      requestedStudyStartDate: requestedDate,
      requestedFirstLectureTime: requestedTime,
      studyStartDate,
      firstLectureTime,
      firstLectureAt: when.toISOString(),
      firstLectureLiveClassId: liveClassId,
      scheduleProvisional: false,
      scheduleConfirmedAt: stamp,
      scheduleConfirmedById: input.actorId,
      scheduleNotice: ATPL_PACKAGE_CONFIRMED_NOTICE,
    };
    row.updatedAt = stamp;
  });

  audit(
    "cgi.schedule.confirm_first_lecture",
    input.actorId,
    "order",
    order.id,
    `Confirmed first lecture for ${student.email} → ${studyStartDate} ${firstLectureTime}`,
  );

  const brand = getPublicBrandConfig();
  const label = formatAtplPackageScheduleLabel(studyStartDate, firstLectureTime);
  try {
    await dispatchEmailEvent({
      event: "schedule",
      userIds: [student.id],
      to: student.email,
      subject: "Your ATPL first lecture is confirmed",
      data: {
        recipientName:
          [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email,
        title: "First lecture confirmed by TKI 1",
        detail: `The Chief Theoretical Knowledge Instructor (TKI 1) confirmed your first lecture for ${label}. It is now on your timetable.`,
        supportEmail: brand.supportEmail,
        reference: order.orderNumber,
      },
      actorId: input.actorId,
      system: true,
    });
  } catch {
    // Confirmation is already stored; email is best-effort.
  }

  return latestPaidPackageSchedule(input.studentId, student.email);
}

export function listAtplStudents() {
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  const packageProduct = getAtplPackageProduct();
  const courseIds = new Set(
    (Array.isArray(packageProduct?.metadata?.courseIds)
      ? (packageProduct!.metadata.courseIds as string[])
      : listAtplCourses().map((c) => c.id)) as string[],
  );

  const auth = readAuthDb().users;
  const enrollments = readCoursesDb().enrollments.filter(
    (e) => courseIds.has(e.courseId) && !["dropped", "rejected"].includes(e.status),
  );
  const byStudent = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = byStudent.get(e.studentId) ?? [];
    list.push(e);
    byStudent.set(e.studentId, list);
  }

  return [...byStudent.entries()]
    .map(([studentId, rows]) => {
      const user = auth.find((u) => u.id === studentId);
      const plan = listStudentSubjectPlan(studentId);
      const first = plan.find((p) => p.sortOrder === 1) ?? null;
      const email = user?.email ?? "";
      const schedule = latestPaidPackageSchedule(studentId, email);
      return {
        studentId,
        email,
        name: user
          ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email
          : "Unknown",
        enrollmentCount: rows.length,
        firstSubjectCourseId: first?.courseId ?? null,
        firstSubjectCode: first?.subjectCode ?? null,
        planCount: plan.length,
        status: user?.status ?? "unknown",
        ...schedule,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listAllInstructors() {
  ensureCoursesSeeded();
  ensureClassesSeeded();
  const instructors = readAuthDb().users.filter((u) => u.role === ROLES.INSTRUCTOR);
  const courses = readCoursesDb().courses.filter((c) => !c.deletedAt);
  const classes = readClassesDb().classes.filter((c) => !c.deletedAt);

  return instructors.map((u) => {
    const assignedCourses = courses.filter(
      (c) =>
        c.primaryInstructorId === u.id ||
        readCoursesDb().instructors.some((i) => i.courseId === c.id && i.userId === u.id),
    );
    const atplCourses = assignedCourses.filter((c) => /^ATPL-/i.test(c.code));
    const upcoming = classes.filter(
      (c) =>
        (c.instructorId === u.id || c.assistantInstructorId === u.id) &&
        c.status !== "cancelled" &&
        c.status !== "completed",
    ).length;
    return {
      instructorId: u.id,
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
      status: u.status,
      courseCount: assignedCourses.length,
      atplSubjectCount: atplCourses.length,
      upcomingClasses: upcoming,
      lectureAssignments: listLectureAssignments({ instructorId: u.id }).length,
    };
  });
}

export function addOversightNote(input: {
  targetType: "student" | "instructor";
  targetUserId: string;
  body: string;
  authorId: string;
}): CgiOversightNote {
  const body = input.body.trim();
  if (!body) throw new CgiError("Note body is required");
  const target = findUserById(input.targetUserId);
  if (!target) throw new CgiError("Target user not found", 404);

  const note: CgiOversightNote = {
    id: generateId(),
    targetType: input.targetType,
    targetUserId: input.targetUserId,
    body,
    authorId: input.authorId,
    createdAt: nowIso(),
  };
  writeCgiDb((db) => {
    db.notes.unshift(note);
  });
  return note;
}

export function listOversightNotes(targetUserId?: string): CgiOversightNote[] {
  return readCgiDb()
    .notes.filter((n) => (targetUserId ? n.targetUserId === targetUserId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCgiDashboardSnapshot() {
  const subjects = listAtplCourses();
  const students = listAtplStudents();
  const instructors = listAllInstructors();
  const lectures = listLectureAssignments();
  const settings = getJourneySettings();
  return {
    settings,
    subjectCount: subjects.length,
    studentCount: students.length,
    instructorCount: instructors.length,
    lectureAssignmentCount: lectures.length,
    defaultFirstSubjectCourseId: settings.defaultFirstSubjectCourseId,
    recentAudit: readCgiDb().audit.slice(0, 12),
    subjects,
    students: students.slice(0, 12),
    pendingFirstLectures: students.filter(
      (s) => s.scheduleProvisional && Boolean(s.requestedFirstLectureLabel),
    ),
    instructors,
  };
}
