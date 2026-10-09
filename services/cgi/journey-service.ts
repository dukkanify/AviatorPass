/**
 * Chief Ground Instructor — ATPL journey orchestration (CR004).
 */

import { generateId } from "@/lib/security/crypto";
import {
  ATPL_COMPLETE_PACKAGE_SUBJECTS,
  ATPL_INSTRUCTOR_CONFIRM_NOTICE,
  ATPL_PACKAGE_CONFIRMED_NOTICE,
  ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
  ATPL_PACKAGE_FIRST_LECTURE_TITLE,
  ATPL_PACKAGE_LMS_COURSE_CODES,
  atplPackageLmsCourseCode,
  ATPL_PACKAGE_NEXT_SUBJECT_NOTICE,
  ATPL_PACKAGE_SUBJECT_COMPLETED_NOTICE,
  ATPL_PACKAGE_OPENING_SUBJECT_CODE,
  ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
  ATPL_PACKAGE_TKI_NOTICE,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
  EMPTY_ATPL_PACKAGE_SCHEDULE,
  atplPackageLectureLessonId,
  atplPackageSubjectOrderIndex,
  atplPackageSubjectTitle,
  type AtplPackageSubjectProgress,
  combineLocalDateAndTime,
  easaCodeFromAtplCourseCode,
  formatAtplFirstLectureTitle,
  formatAtplLectureTitle,
  formatAtplPackageInstant,
  formatAtplPackageScheduleLabel,
  type AtplPackageScheduleSnapshot,
} from "@/constants/atpl-complete-package";
import { DEFAULT_CLASS_DURATION_MINUTES } from "@/constants/classes";
import { ROLES } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { publicAppOrigin } from "@/lib/site-origin";
import { stableCourseId } from "@/lib/courses/public-course-path";
import { listAllUsers } from "@/lib/data/auth-identity-store";
import { restoreMissingPaidIdentities } from "@/services/auth/restore-paid-identities";
import { findUserByEmail, findUserById } from "@/services/auth/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import {
  listEnrollmentsForCourse,
  readCoursesDb,
  rebindEnrollmentsStudent,
} from "@/services/courses/store";
import { upsertEnrollment } from "@/lib/data/lms-enrollment-store";
import {
  enrollStudent,
  listStudentEnrollments,
  updateEnrollmentStatus,
} from "@/services/courses/enrollment-service";
import { CourseValidationError } from "@/services/courses/validation";
import { notifyAtplInstructorAssigned } from "@/services/cgi/assignment-email";
import { instructorAssignmentFromOrder } from "@/services/cgi/instructor-assignment-status";
import { renderAutomationTemplate } from "@/services/email/automation-templates";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { notifyInstructorAssignmentPendingOps } from "@/services/email/instructor-assignment-ops-email";
import { sendEmail } from "@/services/email/mailer";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  getOrderById,
  listOrdersByStatus,
  listOrdersForEmail,
  listOrdersForStudent,
  upsertOrder,
} from "@/lib/data/lms-payment-ledger-store";
import { readPaymentsDb } from "@/services/payments/store";
import {
  createLiveClass,
  enrollStudentsInLiveClass,
  getLiveClass,
  rescheduleLiveClass,
  updateLiveClass,
  canManageClass,
} from "@/services/classes/class-service";
import { ClassValidationError } from "@/services/classes/validation";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { listAllParticipants, readClassesDb } from "@/services/classes/store";
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

function patchPaidOrder(
  orderId: string,
  patch: (order: NonNullable<ReturnType<typeof getOrderById>>) => void,
) {
  const current = getOrderById(orderId);
  if (!current) return;
  patch(current);
  upsertOrder(current);
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

function easaFromAtplCourse(course: { code: string; subjectCode?: string | null }): string | null {
  return easaCodeFromAtplCourseCode(course.subjectCode) ?? easaCodeFromAtplCourseCode(course.code);
}

function officialTitleForAtplCourse(course: {
  code: string;
  title?: string;
  subjectCode?: string | null;
}): string {
  return (
    atplPackageSubjectTitle(course.subjectCode) ??
    atplPackageSubjectTitle(course.code) ??
    course.title ??
    ATPL_PACKAGE_OPENING_SUBJECT_TITLE
  );
}

export function listAtplCourses() {
  ensureCoursesSeeded();
  return readCoursesDb()
    .courses.filter((c) => !c.deletedAt && /^ATPL-/i.test(c.code))
    .map((c) => ({
      id: c.id,
      code: c.code,
      title: officialTitleForAtplCourse(c),
      primaryInstructorId: c.primaryInstructorId,
      status: c.status,
      subjectCode: typeof c.metadata?.subjectCode === "string" ? c.metadata.subjectCode : c.code,
    }))
    .sort((a, b) => {
      const order =
        atplPackageSubjectOrderIndex(easaFromAtplCourse(a)) -
        atplPackageSubjectOrderIndex(easaFromAtplCourse(b));
      return order !== 0 ? order : a.code.localeCompare(b.code);
    });
}

function officialPackageCourses() {
  const wanted = new Set<string>(ATPL_PACKAGE_LMS_COURSE_CODES);
  const wantedEasa = new Set<string>(ATPL_COMPLETE_PACKAGE_SUBJECTS.map((subject) => subject.code));
  const courses = listAtplCourses();
  const byCode = courses.filter((course) => wanted.has(course.code));
  if (byCode.length) return byCode;
  return courses.filter((course) => {
    const easa = easaFromAtplCourse(course);
    return Boolean(easa && wantedEasa.has(easa));
  });
}

function studentHasAtplEnrollment(studentId: string): boolean {
  const atplIds = new Set(ATPL_PACKAGE_LMS_COURSE_CODES.map((code) => stableCourseId(code)));
  return listStudentEnrollments(studentId).some(
    (row) =>
      !["dropped", "rejected"].includes(row.status) &&
      (atplIds.has(row.courseId) || /ATPL|package/i.test(String(row.notes ?? ""))),
  );
}

function studentHasOfficialPackageCoverage(studentId: string): boolean {
  const enrolled = listStudentEnrollments(studentId).filter(
    (row) => !["dropped", "rejected"].includes(row.status),
  );
  if (enrolled.length >= ATPL_PACKAGE_LMS_COURSE_CODES.length) return true;
  const enrolledIds = new Set(enrolled.map((row) => row.courseId));
  const required = officialPackageCourses();
  return required.length > 0 && required.every((course) => enrolledIds.has(course.id));
}

function listAtplPackageSubjectProgress(studentId?: string): AtplPackageSubjectProgress[] {
  const plan = studentId ? listStudentSubjectPlan(studentId) : [];
  const byCourse = new Map(plan.map((row) => [row.courseId, row]));
  return ATPL_COMPLETE_PACKAGE_SUBJECTS.map((subject, index) => {
    const courseId = stableCourseId(atplPackageLmsCourseCode(subject.code));
    const row = (courseId ? byCourse.get(courseId) : null) ?? null;
    const opening = subject.code === ATPL_PACKAGE_OPENING_SUBJECT_CODE || index === 0;
    const status = row?.status ?? (opening ? "available" : "locked");
    return {
      code: subject.code,
      title: subject.title,
      shortDescription: subject.shortDescription,
      status,
      opening,
    };
  });
}

function attachPackageSubjects(
  snapshot: AtplPackageScheduleSnapshot,
  studentId?: string,
  email?: string,
): AtplPackageScheduleSnapshot {
  const owned =
    Boolean(snapshot.orderId) ||
    (studentId ? studentHasAtplEnrollment(studentId) : false) ||
    Boolean(studentId && email && latestPaidPackageOrder(studentId, email));
  return {
    ...snapshot,
    packageOwned: owned,
    subjects: owned ? listAtplPackageSubjectProgress(studentId) : [],
  };
}

function openingSubjectCourse(
  courses = listAtplCourses(),
): ReturnType<typeof listAtplCourses>[number] | null {
  return (
    courses.find((course) => easaFromAtplCourse(course) === ATPL_PACKAGE_OPENING_SUBJECT_CODE) ??
    courses[0] ??
    null
  );
}

export function getAtplPackageProduct() {
  ensurePaymentsSeeded();
  return readPaymentsDb().products.find((p) => p.metadata?.sku === "ATPL-PACKAGE") ?? null;
}

function persistOfficialOpeningDefault(courses = listAtplCourses()) {
  const opening = openingSubjectCourse(courses);
  if (!opening) return;
  const settings = readCgiDb().settings;
  if (settings.defaultFirstSubjectCourseId === opening.id && settings.openingDefaultHealedAt) {
    return;
  }
  writeCgiDb((db) => {
    db.settings.defaultFirstSubjectCourseId = opening.id;
    db.settings.openingDefaultHealedAt = db.settings.openingDefaultHealedAt ?? nowIso();
    db.settings.updatedAt = nowIso();
  });
  audit(
    "cgi.first_subject.default",
    null,
    "course",
    opening.id,
    `Healed CGI default first subject → ${opening.code} ${officialTitleForAtplCourse(opening)}`,
  );
}

export function getJourneySettings() {
  persistOfficialOpeningDefault();
  return readCgiDb().settings;
}

function resolveFirstSubjectCourseId(courses = listAtplCourses()): string | null {
  return openingSubjectCourse(courses)?.id ?? getJourneySettings().defaultFirstSubjectCourseId;
}

export function setDefaultFirstSubject(input: {
  courseId: string;
  actorId: string;
}): ReturnType<typeof getJourneySettings> {
  const course = listAtplCourses().find((c) => c.id === input.courseId);
  if (!course) throw new CgiError("ATPL subject course not found", 404);

  writeCgiDb((db) => {
    db.settings.defaultFirstSubjectCourseId = input.courseId;
    db.settings.openingDefaultHealedAt = db.settings.openingDefaultHealedAt ?? nowIso();
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
  persistOfficialOpeningDefault();
  const courses = officialPackageCourses();
  const existing = readCgiDb()
    .subjectAssignments.filter((a) => a.studentId === studentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (existing.length) {
    const have = new Set(existing.map((row) => row.courseId));
    const missing = courses.filter((course) => !have.has(course.id));
    if (missing.length) {
      const stamp = nowIso();
      let sortOrder = existing[existing.length - 1]?.sortOrder ?? existing.length;
      const extras: AtplSubjectAssignment[] = missing.map((course) => {
        sortOrder += 1;
        return {
          id: generateId(),
          studentId,
          courseId: course.id,
          subjectCode: course.subjectCode,
          sortOrder,
          status: "locked" as AtplSubjectDistributionStatus,
          assignedInstructorId: course.primaryInstructorId,
          unlockedAt: null,
          completedAt: null,
          notes: "Added from the ATPL Complete Package",
          assignedById: actorId,
          createdAt: stamp,
          updatedAt: stamp,
        };
      });
      writeCgiDb((db) => {
        db.subjectAssignments.push(...extras);
      });
      audit(
        "cgi.subjects.heal",
        actorId,
        "student",
        studentId,
        `Added ${extras.length} missing ATPL subjects`,
      );
    }
    putOpeningSubjectFirst(studentId, actorId);
    return listStudentSubjectPlan(studentId);
  }

  if (!courses.length) return [];

  const firstId = resolveFirstSubjectCourseId(courses) ?? courses[0]!.id;
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

function putOpeningSubjectFirst(studentId: string, actorId: string | null) {
  const opening = openingSubjectCourse();
  if (!opening) return;
  const rows = listStudentSubjectPlan(studentId);
  const openRow = rows.find((row) => row.courseId === opening.id);
  if (!openRow || openRow.status === "completed") return;
  const alreadyFirst = openRow.sortOrder === 1;
  const needsUnlock = openRow.status === "locked";
  if (alreadyFirst && !needsUnlock) return;

  const stamp = nowIso();
  writeCgiDb((db) => {
    const mine = db.subjectAssignments
      .filter((row) => row.studentId === studentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const target = mine.find((row) => row.courseId === opening.id);
    if (!target) return;
    const rest = mine.filter((row) => row.id !== target.id);
    target.sortOrder = 1;
    if (target.status === "locked") {
      target.status = "available";
      target.unlockedAt = target.unlockedAt ?? stamp;
    }
    target.updatedAt = stamp;
    rest.forEach((row, index) => {
      row.sortOrder = index + 2;
      row.updatedAt = stamp;
    });
  });
  audit(
    "cgi.subjects.opening",
    actorId,
    "student",
    studentId,
    `Moved ${officialTitleForAtplCourse(opening)} to first subject`,
  );
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

function usableLiveClass(id?: string | null) {
  if (!id) return null;
  const live = getLiveClass(id);
  if (!live || live.status === "cancelled") return null;
  return live;
}

function packageLectureStartsAt(studentId: string): string | null {
  const student = findUserById(studentId);
  if (!student) return null;
  const order = latestPaidPackageOrder(studentId, student.email);
  if (!order) return null;
  const date = String(
    order.metadata.studyStartDate ?? order.metadata.requestedStudyStartDate ?? "",
  );
  const time = String(
    order.metadata.firstLectureTime ?? order.metadata.requestedFirstLectureTime ?? "",
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const when = combineLocalDateAndTime(date, time);
    if (!Number.isNaN(when.getTime()) && when.getTime() > Date.now() - 60_000) {
      return when.toISOString();
    }
  }
  if (typeof order.metadata.firstLectureAt === "string") {
    const when = Date.parse(order.metadata.firstLectureAt);
    if (Number.isFinite(when) && when > Date.now() - 60_000) {
      return new Date(when).toISOString();
    }
  }
  return usableLiveClass(liveClassIdFromOrder(order))?.startsAt ?? null;
}

function soonLectureStartsAt() {
  const when = new Date(Date.now() + 20 * 60_000);
  when.setSeconds(0, 0);
  return when.toISOString();
}

function unconflictedLectureStartsAt() {
  const when = new Date(Date.now() + 21 * 86_400_000);
  when.setUTCMinutes(0, 0, 0);
  return when.toISOString();
}

function rememberFirstLectureLiveClass(studentId: string, liveClassId: string) {
  const student = findUserById(studentId);
  if (!student) return;
  const order = latestPaidPackageOrder(studentId, student.email);
  if (!order) return;
  const stamp = nowIso();
  patchPaidOrder(order.id, (row) => {
    row.metadata = { ...row.metadata, firstLectureLiveClassId: liveClassId };
    row.updatedAt = stamp;
  });
}

async function bindLiveClassToAssignedSubject(input: {
  liveClassId: string;
  studentId: string;
  courseId: string;
  instructorId: string;
  title: string;
  lessonId: string;
  notes: string;
  actorId: string;
}): Promise<string> {
  enrollStudentsInLiveClass(input.liveClassId, [input.studentId]);
  const live = getLiveClass(input.liveClassId);
  if (
    live &&
    (live.courseId !== input.courseId ||
      live.instructorId !== input.instructorId ||
      live.title !== input.title ||
      live.lessonId !== input.lessonId)
  ) {
    try {
      await updateLiveClass({
        id: input.liveClassId,
        patch: {
          courseId: input.courseId,
          instructorId: input.instructorId,
          title: input.title,
          lessonId: input.lessonId,
          description: input.notes,
        },
        actorId: input.actorId,
      });
    } catch {
      // Classroom is still open for this student on the existing meeting.
    }
  }
  return input.liveClassId;
}

async function ensureAssignedSubjectLiveClass(input: {
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
}): Promise<string | null> {
  if (!input.studentId && !input.scheduledAt) return null;

  const course = listAtplCourses().find((item) => item.id === input.courseId);
  const subjectTitle = course
    ? officialTitleForAtplCourse(course)
    : input.lessonTitle.trim() || "ATPL lecture";
  const plan = input.studentId ? listStudentSubjectPlan(input.studentId) : [];
  const selectedFirst = Boolean(
    input.studentId && (plan.length === 0 || plan[0]?.courseId === input.courseId),
  );
  const title = selectedFirst
    ? formatAtplFirstLectureTitle(subjectTitle)
    : formatAtplLectureTitle(subjectTitle);
  const lessonId = selectedFirst ? ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID : input.lessonId;
  const notes = input.notes ?? "";

  if (input.studentId) {
    const existingAssignment = listLectureAssignments({
      studentId: input.studentId,
      courseId: input.courseId,
    }).find((row) => usableLiveClass(row.liveClassId));
    if (existingAssignment?.liveClassId) {
      const liveClassId = await bindLiveClassToAssignedSubject({
        liveClassId: existingAssignment.liveClassId,
        studentId: input.studentId,
        courseId: input.courseId,
        instructorId: input.instructorId,
        title,
        lessonId,
        notes,
        actorId: input.actorId,
      });
      if (selectedFirst) rememberFirstLectureLiveClass(input.studentId, liveClassId);
      return liveClassId;
    }

    if (selectedFirst) {
      const student = findUserById(input.studentId);
      const order = student ? latestPaidPackageOrder(input.studentId, student.email) : null;
      const orderClass = usableLiveClass(order ? liveClassIdFromOrder(order) : null);
      if (orderClass) {
        const liveClassId = await bindLiveClassToAssignedSubject({
          liveClassId: orderClass.id,
          studentId: input.studentId,
          courseId: input.courseId,
          instructorId: input.instructorId,
          title,
          lessonId,
          notes,
          actorId: input.actorId,
        });
        rememberFirstLectureLiveClass(input.studentId, liveClassId);
        return liveClassId;
      }
    }
  }

  const startsAt =
    (input.scheduledAt && Number.isFinite(Date.parse(input.scheduledAt))
      ? new Date(input.scheduledAt).toISOString()
      : null) ??
    (selectedFirst && input.studentId ? packageLectureStartsAt(input.studentId) : null) ??
    soonLectureStartsAt();

  if (selectedFirst && input.studentId) {
    const shared = findSharedFirstLecture(startsAt, input.courseId);
    if (shared) {
      const liveClassId = await bindLiveClassToAssignedSubject({
        liveClassId: shared.id,
        studentId: input.studentId,
        courseId: input.courseId,
        instructorId: shared.instructorId,
        title,
        lessonId,
        notes,
        actorId: input.actorId,
      });
      rememberFirstLectureLiveClass(input.studentId, liveClassId);
      return liveClassId;
    }
  }

  const instructorIds = [
    input.instructorId,
    ...firstLectureInstructorIds(input.courseId, input.instructorId).filter(
      (id) => id !== input.instructorId,
    ),
  ];
  let lastError: string | null = null;
  const attemptTimes = [
    startsAt,
    soonLectureStartsAt(),
    new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
    unconflictedLectureStartsAt(),
  ].filter((value, index, list) => list.indexOf(value) === index);
  for (const attemptStartsAt of attemptTimes) {
    for (const instructorId of instructorIds) {
      try {
        const created = await createLiveClass({
          title,
          description: notes,
          courseId: input.courseId,
          lessonId,
          instructorId,
          startsAt: attemptStartsAt,
          durationMinutes: DEFAULT_CLASS_DURATION_MINUTES,
          enrollStudentIds: input.studentId ? [input.studentId] : undefined,
          omitScheduleEmail: true,
          actorId: input.actorId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
        if (!created?.id) {
          lastError = "Could not create the live class";
          continue;
        }
        if (input.studentId && selectedFirst) {
          rememberFirstLectureLiveClass(input.studentId, created.id);
        }
        return created.id;
      } catch (error) {
        if (error instanceof ClassValidationError || error instanceof CgiError) {
          lastError = error.message;
          continue;
        }
        throw error;
      }
    }
  }

  if (lastError && input.scheduledAt) {
    throw new CgiError(lastError);
  }
  return null;
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
  const liveClassId = await ensureAssignedSubjectLiveClass(input);
  const live = usableLiveClass(liveClassId);
  const plan = input.studentId ? listStudentSubjectPlan(input.studentId) : [];
  const selectedFirst = Boolean(
    input.studentId && (plan.length === 0 || plan[0]?.courseId === input.courseId),
  );
  const lessonId = selectedFirst ? ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID : input.lessonId;
  const scheduledAt = input.scheduledAt ?? live?.startsAt ?? null;
  const status = liveClassId || scheduledAt ? "scheduled" : "assigned";

  const existingFirst =
    input.studentId && selectedFirst
      ? readCgiDb().lectureAssignments.find(
          (row) =>
            row.studentId === input.studentId &&
            row.lessonId === ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
        )
      : null;

  const row: AtplLectureAssignment = existingFirst
    ? {
        ...existingFirst,
        courseId: input.courseId,
        lessonId,
        lessonTitle: input.lessonTitle.trim() || existingFirst.lessonTitle,
        instructorId: input.instructorId,
        studentId: input.studentId ?? null,
        status,
        scheduledAt,
        liveClassId,
        notes: input.notes ?? existingFirst.notes,
        assignedById: input.actorId,
        updatedAt: stamp,
      }
    : {
        id: generateId(),
        courseId: input.courseId,
        lessonId,
        lessonTitle: input.lessonTitle.trim() || "Lecture",
        instructorId: input.instructorId,
        studentId: input.studentId ?? null,
        status,
        scheduledAt,
        liveClassId,
        notes: input.notes ?? null,
        assignedById: input.actorId,
        createdAt: stamp,
        updatedAt: stamp,
      };

  writeCgiDb((db) => {
    if (existingFirst) {
      const index = db.lectureAssignments.findIndex((item) => item.id === existingFirst.id);
      if (index >= 0) db.lectureAssignments[index] = row;
      return;
    }
    db.lectureAssignments.unshift(row);
  });
  audit("cgi.lectures.distribute", input.actorId, "lecture", row.id, row.lessonTitle);
  try {
    await notifyAtplInstructorAssigned({
      instructorId: input.instructorId,
      studentId: input.studentId,
      courseId: input.courseId,
      lessonTitle: row.lessonTitle,
      scheduledAt: input.scheduledAt,
      comments: input.notes,
      liveClassId,
      actorId: input.actorId,
    });
  } catch {
    // Lecture is stored; official assignment email is best-effort.
  }
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

export function listAssignedFirstLectures(options?: { instructorId?: string }): Array<{
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  instructorId: string;
  scheduledAt: string | null;
  label: string | null;
  liveClassId: string | null;
  onTimetable: boolean;
  courseId: string;
  subjectCode: string | null;
  subjectTitle: string;
}> {
  return listLectureAssignments({ instructorId: options?.instructorId })
    .filter(
      (row) =>
        Boolean(row.studentId) &&
        row.lessonId === ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID &&
        row.status === "scheduled",
    )
    .map((row) => {
      const studentId = row.studentId as string;
      const student = findUserById(studentId);
      const live = row.liveClassId ? getLiveClass(row.liveClassId) : null;
      const scheduledAt = row.scheduledAt ?? live?.startsAt ?? null;
      const course =
        listAtplCourses().find((item) => item.id === row.courseId) ??
        (live?.courseId ? listAtplCourses().find((item) => item.id === live.courseId) : null);
      const subjectTitle = course
        ? officialTitleForAtplCourse(course)
        : (atplPackageSubjectTitle(row.lessonTitle) ?? ATPL_PACKAGE_OPENING_SUBJECT_TITLE);
      return {
        id: row.id,
        studentId,
        studentName: student
          ? [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email
          : "Student",
        studentEmail: student?.email ?? "",
        instructorId: row.instructorId,
        scheduledAt,
        label: scheduledAt ? formatAtplPackageInstant(scheduledAt) : null,
        liveClassId: row.liveClassId,
        onTimetable: Boolean(live && live.status !== "cancelled"),
        courseId: row.courseId,
        subjectCode: course ? easaFromAtplCourse(course) : null,
        subjectTitle,
      };
    })
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .slice(0, 20);
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

function isPaidAtplPackageOrder(order: {
  status: string;
  items: Array<{ productName?: string }>;
  metadata?: Record<string, unknown>;
}): boolean {
  const unlocked = order.status === "paid" || Boolean(order.metadata?.firstInstallmentPaidAt);
  if (!unlocked) return false;
  const purchaseFirst =
    Boolean(order.metadata?.purchaseFirst) && typeof order.metadata?.studyStartDate === "string";
  const atplNamed = /ATPL/i.test(order.items[0]?.productName ?? "");
  return purchaseFirst || atplNamed || order.metadata?.sku === "ATPL-PACKAGE";
}

function orderEmail(order: { studentEmail?: string | null; billingEmail?: string | null }) {
  return (order.studentEmail || order.billingEmail || "").trim().toLowerCase();
}

function bindPaidOrderToStudent(
  orderId: string,
  live: { studentId: string; email: string; name?: string },
  fromStudentId?: string | null,
) {
  const from = fromStudentId || "guest";
  if (!live.studentId || from === live.studentId) return;
  const order = getOrderById(orderId);
  if (!order || order.studentId === live.studentId) return;
  order.studentId = live.studentId;
  order.studentEmail = live.email || order.studentEmail;
  if (live.name) order.studentName = live.name;
  order.metadata = { ...order.metadata, reboundFromStudentId: from };
  order.updatedAt = nowIso();
  upsertOrder(order);
  if (from && from !== "guest") {
    rebindEnrollmentsStudent(from, live.studentId);
  }
}

/** Rebind paid ATPL orders/enrollments onto the live account for the billing email. */
export function rebindPaidPackageOrdersToLiveUsers(): number {
  const usersByEmail = new Map(
    listAllUsers().map((user) => [user.email.trim().toLowerCase(), user] as const),
  );
  const pending: Array<{ id: string; from: string; to: string; email: string; name: string }> = [];
  for (const order of listOrdersByStatus("paid")) {
    if (!isPaidAtplPackageOrder(order)) continue;
    const email = orderEmail(order);
    const user = email ? usersByEmail.get(email) : undefined;
    if (!user || order.studentId === user.id) continue;
    pending.push({
      id: order.id,
      from: order.studentId || "guest",
      to: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email,
    });
  }
  if (!pending.length) return 0;

  const stamp = nowIso();
  for (const row of pending) {
    const order = getOrderById(row.id);
    if (!order) continue;
    order.studentId = row.to;
    order.studentEmail = row.email;
    order.studentName = row.name;
    order.metadata = { ...order.metadata, reboundFromStudentId: row.from };
    order.updatedAt = stamp;
    upsertOrder(order);
  }
  for (const { from, to } of pending) {
    rebindEnrollmentsStudent(from, to);
  }
  return pending.length;
}

let rebindPaidOrdersThisIsolate = false;

function resolveLivePaidStudent(studentId: string, email: string) {
  if (!rebindPaidOrdersThisIsolate) {
    rebindPaidOrdersThisIsolate = true;
    rebindPaidPackageOrdersToLiveUsers();
  }
  const live = findUserByEmail(email) ?? findUserById(studentId);
  return {
    studentId: live?.id ?? studentId,
    email: live?.email ?? email,
  };
}

function latestPaidPackageOrder(studentId: string, email: string) {
  ensurePaymentsSeeded();
  const byId = new Map<string, ReturnType<typeof listOrdersForStudent>[number]>();
  for (const order of [...listOrdersForStudent(studentId), ...listOrdersForEmail(email)]) {
    byId.set(order.id, order);
  }
  const matches = [...byId.values()].filter(
    (order) => order.status === "paid" || Boolean(order.metadata?.firstInstallmentPaidAt),
  );
  const atpl = matches.filter((order) => isPaidAtplPackageOrder(order));
  return (
    (atpl.length ? atpl : matches)
      .slice()
      .sort((a, b) => (b.paidAt ?? b.updatedAt).localeCompare(a.paidAt ?? a.updatedAt))[0] ?? null
  );
}

function liveClassIdFromOrder(
  order: NonNullable<ReturnType<typeof latestPaidPackageOrder>>,
): string | null {
  return typeof order.metadata.firstLectureLiveClassId === "string"
    ? order.metadata.firstLectureLiveClassId
    : null;
}

function firstLectureSubjectForStudent(studentId?: string): {
  code: string | null;
  title: string | null;
} {
  const planFirst = studentId ? (listStudentSubjectPlan(studentId)[0] ?? null) : null;
  const courseId = planFirst?.courseId ?? null;
  const code =
    ATPL_PACKAGE_LMS_COURSE_CODES.find((item) => stableCourseId(item) === courseId) ??
    atplPackageLmsCourseCode(ATPL_PACKAGE_OPENING_SUBJECT_CODE);
  return {
    code: easaCodeFromAtplCourseCode(code),
    title: atplPackageSubjectTitle(code) ?? ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
  };
}

function nextOfficialSubjectState(studentId?: string): {
  nextSubjectCode: string | null;
  nextSubjectTitle: string | null;
  nextSubjectStatus: AtplPackageScheduleSnapshot["nextSubjectStatus"];
  nextLectureLabel: string | null;
  nextLectureLiveClassId: string | null;
  courseId: string | null;
} {
  const empty = {
    nextSubjectCode: null,
    nextSubjectTitle: null,
    nextSubjectStatus: null,
    nextLectureLabel: null,
    nextLectureLiveClassId: null,
    courseId: null,
  };
  if (!studentId) return empty;
  const plan = listStudentSubjectPlan(studentId);
  if (!plan.length) return empty;
  for (const subject of ATPL_COMPLETE_PACKAGE_SUBJECTS) {
    if (subject.code === ATPL_PACKAGE_OPENING_SUBJECT_CODE) continue;
    const courseId = stableCourseId(atplPackageLmsCourseCode(subject.code));
    if (!courseId) continue;
    const row = plan.find((item) => item.courseId === courseId);
    if (!row || row.status === "completed") continue;
    const lecture =
      listLectureAssignments({ studentId, courseId }).find(
        (item) => item.scheduledAt && item.status === "scheduled",
      ) ?? null;
    return {
      nextSubjectCode: subject.code,
      nextSubjectTitle: subject.title,
      nextSubjectStatus: row.status,
      nextLectureLabel: lecture?.scheduledAt ? formatAtplPackageInstant(lecture.scheduledAt) : null,
      nextLectureLiveClassId: lecture?.liveClassId ?? null,
      courseId,
    };
  }
  return empty;
}

function packageScheduleFromOrder(
  order: NonNullable<ReturnType<typeof latestPaidPackageOrder>>,
  studentId?: string,
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
  const liveClassId = liveClassIdFromOrder(order);
  const confirmedAt =
    !provisional && typeof order.metadata.firstLectureAt === "string"
      ? order.metadata.firstLectureAt
      : null;
  const subject = firstLectureSubjectForStudent(studentId);
  const next = nextOfficialSubjectState(studentId);
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
    confirmedFirstLectureAt: confirmedAt,
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
    firstLectureLiveClassId: liveClassId,
    firstLectureOnTimetable: Boolean(liveClassId),
    firstLectureSubjectCode: subject.code,
    firstLectureSubjectTitle: subject.title,
    packageOwned: true,
    subjects: listAtplPackageSubjectProgress(studentId),
    nextSubjectCode: next.nextSubjectCode,
    nextSubjectTitle: next.nextSubjectTitle,
    nextSubjectStatus: next.nextSubjectStatus,
    nextLectureLabel: next.nextLectureLabel,
    nextLectureLiveClassId: next.nextLectureLiveClassId,
    ...instructorAssignmentFromOrder(order, studentId),
  };
}

function latestPaidPackageSchedule(studentId: string, email: string): AtplPackageScheduleSnapshot {
  const order = latestPaidPackageOrder(studentId, email);
  if (!order) {
    return attachPackageSubjects(EMPTY_ATPL_PACKAGE_SCHEDULE, studentId, email);
  }
  return attachPackageSubjects(packageScheduleFromOrder(order, studentId), studentId, email);
}

export function getStudentAtplPackageSchedule(studentId: string, email: string) {
  ensurePaymentsSeeded();
  const live = resolveLivePaidStudent(studentId, email);
  return latestPaidPackageSchedule(live.studentId, live.email);
}

export async function hydratePaidAtplStudentAccess(
  studentId: string,
  email: string,
  orderId?: string,
) {
  const known = findUserByEmail(email) ?? findUserById(studentId);
  if (studentHasOfficialPackageCoverage(known?.id ?? studentId)) {
    return;
  }
  ensurePaymentsSeeded();
  const live = resolveLivePaidStudent(studentId, email);
  const pinned = orderId ? (getOrderById(orderId) ?? null) : null;
  let order = pinned ?? latestPaidPackageOrder(live.studentId, live.email);
  if (order && order.studentId !== live.studentId) {
    const liveUser = findUserById(live.studentId);
    bindPaidOrderToStudent(
      order.id,
      {
        studentId: live.studentId,
        email: live.email,
        name: liveUser
          ? `${liveUser.firstName} ${liveUser.lastName}`.trim() || liveUser.email
          : undefined,
      },
      order.studentId,
    );
    order = getOrderById(order.id) ?? order;
  }
  if (order && studentHasOfficialPackageCoverage(live.studentId)) {
    // Confirmation / ops mail must not block the student dashboard.
    void maybeSendPackageConfirmationFollowup(order, live.studentId).catch(() => undefined);
    void notifyInstructorAssignmentPendingOps(order).catch(() => undefined);
    return;
  }
  ensureCoursesSeeded();
  await ensureAtplPackageSubjectCoverage(live.studentId, live.email, order);
  if (order) {
    void maybeSendPackageConfirmationFollowup(order, live.studentId).catch(() => undefined);
    void notifyInstructorAssignmentPendingOps(order).catch(() => undefined);
  }
}

async function maybeSendPackageConfirmationFollowup(
  order: NonNullable<ReturnType<typeof latestPaidPackageOrder>>,
  studentId: string,
) {
  if (order.metadata.packageConfirmationFollowupAt) return;
  if (!isPaidAtplPackageOrder(order)) return;
  const user = findUserById(studentId);
  if (!user) return;
  const packageName = order.items[0]?.productName ?? "Aviator Pass";
  const brand = getPublicBrandConfig();
  const stamp = nowIso();
  patchPaidOrder(order.id, (current) => {
    current.metadata = { ...current.metadata, packageConfirmationFollowupAt: stamp };
    current.updatedAt = stamp;
  });
  const data = {
    recipientName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email,
    title: "Package confirmed",
    detail: `${packageName} is confirmed. ${ATPL_PENDING_INSTRUCTOR_ASSIGNMENT} — ${ATPL_INSTRUCTOR_CONFIRM_NOTICE}`,
    packageName,
    instructorAssignmentLabel:
      typeof order.metadata.instructorAssignmentLabel === "string"
        ? order.metadata.instructorAssignmentLabel
        : ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
    instructorConfirmNotice: ATPL_INSTRUCTOR_CONFIRM_NOTICE,
    loginUrl: `${publicAppOrigin()}${routes.login}`,
    courseUrl: `${publicAppOrigin()}${routes.studentDashboard}`,
    supportEmail: brand.supportEmail,
    reference: order.orderNumber,
    cta: "Open your course",
  };
  const template = renderAutomationTemplate("payment", data, "Package confirmed");
  void sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    meta: { kind: "package_confirmation_followup", orderId: order.id, userId: user.id },
  }).catch(() => {
    // Delivery is best-effort; the in-app package confirmation still stands.
  });
}

async function ensureAtplPackageSubjectCoverage(
  studentId: string,
  email: string,
  pinnedOrder?: { id: string; metadata: Record<string, unknown> } | null,
): Promise<void> {
  const order = pinnedOrder ?? latestPaidPackageOrder(studentId, email);
  const owned = Boolean(order) || studentHasAtplEnrollment(studentId);
  if (!owned) return;
  ensureStudentSubjectPlan(studentId, studentId);
  const actorId =
    typeof order?.metadata.scheduleConfirmedById === "string"
      ? order.metadata.scheduleConfirmedById
      : studentId;
  const enrolled = new Set(
    listStudentEnrollments(studentId)
      .filter((row) => !["dropped", "rejected"].includes(row.status))
      .map((row) => row.courseId),
  );
  const missing = officialPackageCourses().filter((course) => !enrolled.has(course.id));
  if (!missing.length) return;
  const now = nowIso();
  for (const course of missing) {
    upsertEnrollment({
      id: generateId(),
      courseId: course.id,
      studentId,
      status: "approved",
      enrolledById: actorId,
      enrolledAt: now,
      approvedAt: now,
      completedAt: null,
      droppedAt: null,
      suspendedAt: null,
      notes: "ATPL Complete Package",
      updatedAt: now,
    });
  }
}

/** Recreate or re-enrol the confirmed first lecture if the live class row disappeared. */
export async function ensureConfirmedFirstLectureOnTimetable(
  studentId: string,
  email: string,
): Promise<AtplPackageScheduleSnapshot> {
  const live = resolveLivePaidStudent(studentId, email);
  await hydratePaidAtplStudentAccess(live.studentId, live.email);
  return latestPaidPackageSchedule(live.studentId, live.email);
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
  lessonTitle?: string;
}) {
  const stamp = nowIso();
  const lessonTitle = input.lessonTitle?.trim() || ATPL_PACKAGE_FIRST_LECTURE_TITLE;
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
      existing.lessonTitle = lessonTitle;
      existing.updatedAt = stamp;
      return;
    }
    db.lectureAssignments.unshift({
      id: generateId(),
      courseId: input.courseId,
      lessonId: FIRST_LECTURE_LESSON_ID,
      lessonTitle,
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
  const course = listAtplCourses().find((item) => item.id === first.courseId);
  const notes = ATPL_PACKAGE_CONFIRMED_NOTICE;
  const title = formatAtplFirstLectureTitle(
    course ? officialTitleForAtplCourse(course) : ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
  );

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
    enrollStudentsInLiveClass(liveClassId, [input.studentId]);
    upsertFirstLectureAssignment({
      studentId: input.studentId,
      courseId: first.courseId,
      instructorId: moved?.instructorId ?? existing.instructorId,
      scheduledAt: startsAt,
      liveClassId,
      actorId: input.actorId,
      notes,
      lessonTitle: title,
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
      lessonTitle: title,
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
        lessonTitle: title,
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
  patchPaidOrder(order.id, (row) => {
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
  const subject = firstLectureSubjectForStudent(input.studentId, liveClassId);
  const subjectLabel = subject.title ?? ATPL_PACKAGE_OPENING_SUBJECT_TITLE;
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
        detail: `The Chief Theoretical Knowledge Instructor (TKI 1) confirmed your first lecture (${subjectLabel}) for ${label}. It is now on your timetable.`,
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

export async function openNextAtplPackageSubject(input: {
  studentId: string;
  actorId: string;
  studyStartDate: string;
  lectureTime: string;
}) {
  const student = findUserById(input.studentId);
  if (!student) throw new CgiError("Student not found", 404);
  const order = latestPaidPackageOrder(input.studentId, student.email);
  if (!order) throw new CgiError("No ATPL package schedule to continue", 404);
  const first = latestPaidPackageSchedule(input.studentId, student.email);
  if (first.scheduleProvisional || !first.confirmedFirstLectureLabel) {
    throw new CgiError("Confirm the first lecture before opening the next subject");
  }

  ensureStudentSubjectPlan(input.studentId, input.actorId);
  const next = nextOfficialSubjectState(input.studentId);
  if (!next.courseId || !next.nextSubjectCode || !next.nextSubjectTitle) {
    throw new CgiError("Every official ATPL subject is already open");
  }
  if (next.nextSubjectStatus !== "locked") {
    throw new CgiError(`${next.nextSubjectTitle} is already open`);
  }

  const date = input.studyStartDate.trim();
  const time = input.lectureTime.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new CgiError("Enter a valid date and time for the next lecture");
  }
  const when = combineLocalDateAndTime(date, time);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    throw new CgiError("Next lecture must be in the future");
  }

  const stamp = nowIso();
  writeCgiDb((db) => {
    const row = db.subjectAssignments.find(
      (item) => item.studentId === input.studentId && item.courseId === next.courseId,
    );
    if (!row) return;
    row.status = "available";
    row.unlockedAt = row.unlockedAt ?? stamp;
    row.updatedAt = stamp;
  });

  const enrollment = listStudentEnrollments(input.studentId).find(
    (row) => row.courseId === next.courseId && !["dropped", "rejected"].includes(row.status),
  );
  if (enrollment && enrollment.status === "suspended") {
    await updateEnrollmentStatus({
      id: enrollment.id,
      status: "approved",
      actorId: input.actorId,
    });
  } else if (!enrollment) {
    try {
      await enrollStudent({
        courseId: next.courseId,
        studentId: input.studentId,
        status: "approved",
        notes: "ATPL Complete Package — next subject",
        actorId: input.actorId,
        bypassEnrollmentGate: true,
      });
    } catch (error) {
      if (!(error instanceof CourseValidationError && /already enrolled/i.test(error.message))) {
        throw error;
      }
    }
  }

  const course = listAtplCourses().find((item) => item.id === next.courseId);
  const instructorId =
    firstLectureInstructorIds(next.courseId, course?.primaryInstructorId ?? null)[0] ?? null;
  if (!instructorId) throw new CgiError("No instructor is available for the next lecture");

  await distributeLecture({
    courseId: next.courseId,
    lessonId: atplPackageLectureLessonId(next.nextSubjectCode),
    lessonTitle: formatAtplLectureTitle(next.nextSubjectTitle),
    instructorId,
    studentId: input.studentId,
    scheduledAt: when.toISOString(),
    notes: ATPL_PACKAGE_NEXT_SUBJECT_NOTICE,
    actorId: input.actorId,
  });

  audit(
    "cgi.schedule.open_next_subject",
    input.actorId,
    "student",
    input.studentId,
    `Opened ${next.nextSubjectTitle} → ${date} ${time}`,
  );

  const brand = getPublicBrandConfig();
  const label = formatAtplPackageScheduleLabel(date, time);
  try {
    await dispatchEmailEvent({
      event: "schedule",
      userIds: [student.id],
      to: student.email,
      subject: "Your next ATPL lecture is booked",
      data: {
        recipientName:
          [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email,
        title: `${next.nextSubjectTitle} is open`,
        detail: `The Chief Theoretical Knowledge Instructor (TKI 1) opened ${next.nextSubjectTitle} and booked the next lecture for ${label}. It is now on your timetable.`,
        supportEmail: brand.supportEmail,
        reference: order.orderNumber,
      },
      actorId: input.actorId,
      system: true,
    });
  } catch {
    // Opening is already stored; email is best-effort.
  }

  return latestPaidPackageSchedule(input.studentId, student.email);
}

export async function completeAtplPackageSubject(input: { studentId: string; actorId: string }) {
  const student = findUserById(input.studentId);
  if (!student) throw new CgiError("Student not found", 404);
  const order = latestPaidPackageOrder(input.studentId, student.email);
  if (!order) throw new CgiError("No ATPL package schedule to continue", 404);
  const first = latestPaidPackageSchedule(input.studentId, student.email);
  if (first.scheduleProvisional || !first.confirmedFirstLectureLabel) {
    throw new CgiError("Confirm the first lecture before completing a subject");
  }

  ensureStudentSubjectPlan(input.studentId, input.actorId);
  const current = nextOfficialSubjectState(input.studentId);
  if (!current.courseId || !current.nextSubjectCode || !current.nextSubjectTitle) {
    throw new CgiError("Every official ATPL subject after Instrumentation is already complete");
  }
  if (current.nextSubjectStatus !== "available" && current.nextSubjectStatus !== "in_progress") {
    throw new CgiError(`Open ${current.nextSubjectTitle} before marking it complete`);
  }

  const stamp = nowIso();
  writeCgiDb((db) => {
    const row = db.subjectAssignments.find(
      (item) => item.studentId === input.studentId && item.courseId === current.courseId,
    );
    if (!row) return;
    row.status = "completed";
    row.completedAt = stamp;
    row.updatedAt = stamp;
  });

  const enrollment = listStudentEnrollments(input.studentId).find(
    (row) => row.courseId === current.courseId && !["dropped", "rejected"].includes(row.status),
  );
  if (enrollment && (enrollment.status === "approved" || enrollment.status === "suspended")) {
    await updateEnrollmentStatus({
      id: enrollment.id,
      status: "completed",
      actorId: input.actorId,
    });
  }

  audit(
    "cgi.schedule.complete_subject",
    input.actorId,
    "student",
    input.studentId,
    `Completed ${current.nextSubjectTitle}`,
  );

  const brand = getPublicBrandConfig();
  const following = nextOfficialSubjectState(input.studentId);
  try {
    await dispatchEmailEvent({
      event: "student_alert",
      userIds: [student.id],
      to: student.email,
      subject: `${current.nextSubjectTitle} is complete`,
      data: {
        recipientName:
          [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email,
        title: `${current.nextSubjectTitle} complete`,
        detail: following.nextSubjectTitle
          ? `${ATPL_PACKAGE_SUBJECT_COMPLETED_NOTICE} Next up: ${following.nextSubjectTitle}.`
          : ATPL_PACKAGE_SUBJECT_COMPLETED_NOTICE,
        supportEmail: brand.supportEmail,
        reference: order.orderNumber,
      },
      actorId: input.actorId,
      system: true,
    });
  } catch {
    // Completion is already stored; email is best-effort.
  }

  return latestPaidPackageSchedule(input.studentId, student.email);
}

function orderStamp(order: { paidAt?: string | null; updatedAt: string }) {
  return order.paidAt ?? order.updatedAt;
}

function slimNextSubject(
  studentId: string,
  plan: AtplSubjectAssignment[],
  courses: ReturnType<typeof listAtplCourses>,
  scheduledLectures: AtplLectureAssignment[],
) {
  const empty = {
    nextSubjectCode: null as string | null,
    nextSubjectTitle: null as string | null,
    nextSubjectStatus: null as AtplPackageScheduleSnapshot["nextSubjectStatus"],
    nextLectureLabel: null as string | null,
    nextLectureLiveClassId: null as string | null,
  };
  if (!plan.length) return empty;
  for (const subject of ATPL_COMPLETE_PACKAGE_SUBJECTS) {
    if (subject.code === ATPL_PACKAGE_OPENING_SUBJECT_CODE) continue;
    const course = courses.find((item) => easaFromAtplCourse(item) === subject.code);
    if (!course) continue;
    const row = plan.find((item) => item.courseId === course.id);
    if (!row || row.status === "completed") continue;
    const lecture =
      scheduledLectures.find(
        (item) => item.studentId === studentId && item.courseId === course.id,
      ) ?? null;
    return {
      nextSubjectCode: subject.code,
      nextSubjectTitle: subject.title,
      nextSubjectStatus: row.status,
      nextLectureLabel: lecture?.scheduledAt ? formatAtplPackageInstant(lecture.scheduledAt) : null,
      nextLectureLiveClassId: lecture?.liveClassId ?? null,
    };
  }
  return empty;
}

function slimDashboardSchedule(
  order: NonNullable<ReturnType<typeof latestPaidPackageOrder>>,
  studentId: string,
  index: {
    courses: ReturnType<typeof listAtplCourses>;
    courseById: Map<string, ReturnType<typeof listAtplCourses>[number]>;
    plan: AtplSubjectAssignment[];
    scheduledLectures: AtplLectureAssignment[];
    classById: Map<string, ReturnType<typeof readClassesDb>["classes"][number]>;
    participants: Set<string>;
  },
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
  const liveClassId = liveClassIdFromOrder(order);
  const live = liveClassId ? (index.classById.get(liveClassId) ?? null) : null;
  const planFirst = index.plan[0] ?? null;
  const subjectCourse =
    (live?.courseId ? (index.courseById.get(live.courseId) ?? null) : null) ??
    (planFirst ? (index.courseById.get(planFirst.courseId) ?? null) : null) ??
    openingSubjectCourse(index.courses);
  const confirmedAt =
    !provisional && typeof order.metadata.firstLectureAt === "string"
      ? order.metadata.firstLectureAt
      : null;
  const next = slimNextSubject(studentId, index.plan, index.courses, index.scheduledLectures);
  const onTimetable = Boolean(
    liveClassId &&
    live &&
    live.status !== "cancelled" &&
    index.participants.has(`${liveClassId}:${studentId}`),
  );
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
    confirmedFirstLectureAt: confirmedAt,
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
    firstLectureLiveClassId: liveClassId,
    firstLectureOnTimetable: onTimetable,
    firstLectureSubjectCode: subjectCourse ? easaFromAtplCourse(subjectCourse) : null,
    firstLectureSubjectTitle: subjectCourse ? officialTitleForAtplCourse(subjectCourse) : null,
    packageOwned: true,
    subjects: [],
    ...next,
    ...instructorAssignmentFromOrder(order, studentId),
  };
}

export function listAtplStudents() {
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  restoreMissingPaidIdentities();
  rebindPaidPackageOrdersToLiveUsers();
  const packageProduct = getAtplPackageProduct();
  const courses = listAtplCourses();
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const courseIds = new Set(
    (Array.isArray(packageProduct?.metadata?.courseIds)
      ? (packageProduct!.metadata.courseIds as string[])
      : courses.map((c) => c.id)) as string[],
  );

  const auth = listAllUsers();
  const userById = new Map(auth.map((user) => [user.id, user]));
  const userByEmail = new Map(auth.map((user) => [user.email.trim().toLowerCase(), user]));
  const enrollments = [...courseIds]
    .flatMap((id) => listEnrollmentsForCourse(id))
    .filter((e) => !["dropped", "rejected"].includes(e.status));
  const byStudent = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = byStudent.get(e.studentId) ?? [];
    list.push(e);
    byStudent.set(e.studentId, list);
  }

  const paidOrders = listOrdersByStatus("paid").filter((order) => isPaidAtplPackageOrder(order));
  const latestByStudent = new Map<string, (typeof paidOrders)[number]>();
  const latestByEmail = new Map<string, (typeof paidOrders)[number]>();
  for (const order of paidOrders) {
    if (order.studentId && order.studentId !== "guest") {
      const current = latestByStudent.get(order.studentId);
      if (!current || orderStamp(order).localeCompare(orderStamp(current)) > 0) {
        latestByStudent.set(order.studentId, order);
      }
    }
    const email = (order.studentEmail || order.billingEmail || "").trim().toLowerCase();
    if (email) {
      const current = latestByEmail.get(email);
      if (!current || orderStamp(order).localeCompare(orderStamp(current)) > 0) {
        latestByEmail.set(email, order);
      }
    }
    const user = email ? userByEmail.get(email) : userById.get(order.studentId);
    const studentId = user?.id || order.studentId;
    if (!studentId || studentId === "guest" || byStudent.has(studentId)) continue;
    byStudent.set(studentId, []);
  }

  const cgi = readCgiDb();
  const planByStudent = new Map<string, typeof cgi.subjectAssignments>();
  for (const row of cgi.subjectAssignments) {
    const list = planByStudent.get(row.studentId) ?? [];
    list.push(row);
    planByStudent.set(row.studentId, list);
  }
  for (const plan of planByStudent.values()) {
    plan.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const scheduledLectures = cgi.lectureAssignments.filter(
    (item) => item.scheduledAt && item.status === "scheduled",
  );
  const classesDb = readClassesDb();
  const classById = new Map(classesDb.classes.map((cls) => [cls.id, cls]));
  const participants = new Set(
    listAllParticipants()
      .filter((row) => row.role === "participant")
      .map((row) => `${row.liveClassId}:${row.userId}`),
  );

  return [...byStudent.entries()]
    .map(([studentId, rows]) => {
      const user = userById.get(studentId);
      const email = user?.email ?? "";
      const plan = planByStudent.get(studentId) ?? [];
      const first = plan.find((p) => p.sortOrder === 1) ?? plan[0] ?? null;
      const firstCourse = first ? (courseById.get(first.courseId) ?? null) : null;
      const order =
        latestByStudent.get(studentId) ??
        (email ? latestByEmail.get(email.trim().toLowerCase()) : undefined) ??
        null;
      const schedule = order
        ? slimDashboardSchedule(order, studentId, {
            courses,
            courseById,
            plan,
            scheduledLectures,
            classById,
            participants,
          })
        : { ...EMPTY_ATPL_PACKAGE_SCHEDULE, subjects: [] };
      return {
        studentId,
        email,
        name: user
          ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email
          : "Unknown",
        enrollmentCount: rows.length,
        firstSubjectCourseId: first?.courseId ?? null,
        firstSubjectCode: firstCourse
          ? easaFromAtplCourse(firstCourse)
          : (easaCodeFromAtplCourseCode(first?.subjectCode) ?? first?.subjectCode ?? null),
        firstSubjectTitle: firstCourse ? officialTitleForAtplCourse(firstCourse) : null,
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
  const instructors = listAllUsers().filter((u) => u.role === ROLES.INSTRUCTOR);
  const db = readCoursesDb();
  const courses = db.courses.filter((c) => !c.deletedAt);
  const assignedByInstructor = new Map<string, typeof courses>();
  for (const course of courses) {
    if (course.primaryInstructorId) {
      const list = assignedByInstructor.get(course.primaryInstructorId) ?? [];
      list.push(course);
      assignedByInstructor.set(course.primaryInstructorId, list);
    }
  }
  for (const row of db.instructors) {
    const course = courses.find((item) => item.id === row.courseId);
    if (!course) continue;
    const list = assignedByInstructor.get(row.userId) ?? [];
    if (!list.some((item) => item.id === course.id)) list.push(course);
    assignedByInstructor.set(row.userId, list);
  }
  const classes = readClassesDb().classes.filter((c) => !c.deletedAt);
  const lectures = readCgiDb().lectureAssignments;
  const lectureCount = new Map<string, number>();
  for (const row of lectures) {
    lectureCount.set(row.instructorId, (lectureCount.get(row.instructorId) ?? 0) + 1);
  }

  return instructors.map((u) => {
    const assignedCourses = assignedByInstructor.get(u.id) ?? [];
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
      lectureAssignments: lectureCount.get(u.id) ?? 0,
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
    pendingInstructorAssignments: students.filter(
      (s) => Boolean(s.orderId) && s.instructorAssignmentStatus === "pending",
    ),
    pendingFirstLectures: students.filter(
      (s) => s.scheduleProvisional && Boolean(s.requestedFirstLectureLabel),
    ),
    confirmedFirstLectures: students.filter(
      (s) => !s.scheduleProvisional && Boolean(s.confirmedFirstLectureLabel),
    ),
    readyForNextSubject: students.filter(
      (s) =>
        !s.scheduleProvisional &&
        Boolean(s.confirmedFirstLectureLabel) &&
        s.nextSubjectStatus === "locked" &&
        Boolean(s.nextSubjectTitle),
    ),
    readyToCompleteSubject: students.filter(
      (s) =>
        !s.scheduleProvisional &&
        Boolean(s.confirmedFirstLectureLabel) &&
        (s.nextSubjectStatus === "available" || s.nextSubjectStatus === "in_progress") &&
        Boolean(s.nextSubjectTitle),
    ),
    instructors,
  };
}
