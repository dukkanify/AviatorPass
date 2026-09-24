/**
 * Official ATPL journey step 9 — instructor assignment emails.
 *
 * Student subject: `{TK label} has been assigned to you.`
 * Body: instructor, subject, date, comments, time, meeting link.
 * Instructor + TKI 1 receive student / subject / link / time.
 * Super User receives a copy.
 *
 * Numbering: CGI = TKI 1; instructors by createdAt (then demo catalog order) = TK 2, TK 3, …
 */

import { DEMO_ACCOUNTS } from "@/constants/demo-accounts";
import { ROLES } from "@/constants/roles";
import { atplPackageSubjectTitle } from "@/constants/atpl-complete-package";
import { appJoinUrl } from "@/lib/site-origin";
import { findUserById, readAuthDb, type StoredUser } from "@/services/auth/store";
import { getCourseById } from "@/services/courses/course-service";
import { getZoomMeetingByClassId } from "@/services/classes/zoom-service";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { notifyUsers } from "@/services/notifications/notification-service";

export type AtplAssignmentNotifyInput = {
  instructorId: string;
  studentId?: string | null;
  courseId?: string | null;
  lessonTitle?: string | null;
  scheduledAt?: string | null;
  comments?: string | null;
  liveClassId?: string | null;
  joinUrl?: string | null;
  actorId?: string | null;
};

export type AtplAssignmentNotifyResult = {
  tkLabel: string;
  studentSubject: string;
  notifiedUserIds: string[];
};

function displayName(
  user: { firstName?: string | null; lastName?: string | null; email: string } | null | undefined,
) {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

const DEMO_INSTRUCTOR_ORDER = new Map(
  DEMO_ACCOUNTS.filter((row) => row.role === ROLES.INSTRUCTOR).map((row, index) => [
    row.email.toLowerCase(),
    index,
  ]),
);

function instructorSortKey(user: StoredUser) {
  const catalog = DEMO_INSTRUCTOR_ORDER.get(user.email.toLowerCase());
  const catalogRank = catalog === undefined ? Number.MAX_SAFE_INTEGER : catalog;
  return `${user.createdAt}\0${String(catalogRank).padStart(4, "0")}\0${user.email.toLowerCase()}\0${user.id}`;
}

export function listNumberedTheoreticalInstructors() {
  return readAuthDb()
    .users.filter((user) => user.role === ROLES.INSTRUCTOR)
    .slice()
    .sort((a, b) => instructorSortKey(a).localeCompare(instructorSortKey(b)));
}

/** CGI is TKI 1. First instructor by createdAt is TK 2. */
export function theoreticalKnowledgeLabel(userId: string): string {
  const user = findUserById(userId);
  if (!user) return "TK 2";
  if (user.role === ROLES.CHIEF_GROUND_INSTRUCTOR) return "TKI 1";
  const instructors = listNumberedTheoreticalInstructors();
  const index = instructors.findIndex((row) => row.id === userId);
  return `TK ${index >= 0 ? index + 2 : 2}`;
}

export function assignedInstructorStudentSubject(tkLabel: string) {
  return `${tkLabel} has been assigned to you.`;
}

function resolveSubjectTitle(courseId?: string | null, fallback?: string | null) {
  if (courseId) {
    const course = getCourseById(courseId);
    if (course) {
      return atplPackageSubjectTitle(course.code) ?? course.title ?? fallback ?? "ATPL lecture";
    }
  }
  return fallback?.trim() || "ATPL lecture";
}

function formatDateTimeParts(iso?: string | null) {
  if (!iso) return { date: "", time: "" };
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return { date: "", time: "" };
  return {
    date: when.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

function resolveJoinUrl(liveClassId?: string | null, explicit?: string | null) {
  const trimmed = explicit?.trim() ?? "";
  if (trimmed) return trimmed;
  if (!liveClassId) return "";
  const meeting = getZoomMeetingByClassId(liveClassId);
  return meeting ? appJoinUrl(liveClassId, meeting.zoomMeetingId) : "";
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function notifyAtplInstructorAssigned(
  input: AtplAssignmentNotifyInput,
): Promise<AtplAssignmentNotifyResult> {
  const instructor = findUserById(input.instructorId);
  const student = input.studentId ? findUserById(input.studentId) : null;
  const tkLabel = theoreticalKnowledgeLabel(input.instructorId);
  const studentSubject = assignedInstructorStudentSubject(tkLabel);
  const instructorName = displayName(instructor);
  const studentName = displayName(student);
  const subjectTitle = resolveSubjectTitle(input.courseId, input.lessonTitle);
  const { date, time } = formatDateTimeParts(input.scheduledAt);
  const comments = input.comments?.trim() || "";
  const joinUrl = resolveJoinUrl(input.liveClassId, input.joinUrl);
  const when = [date, time].filter(Boolean).join(" · ");

  const auth = readAuthDb();
  const cgiIds = auth.users
    .filter((user) => user.role === ROLES.CHIEF_GROUND_INSTRUCTOR && user.status === "active")
    .map((user) => user.id);
  const adminIds = auth.users
    .filter(
      (user) =>
        (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) && user.status === "active",
    )
    .map((user) => user.id);

  const staffDetail = [
    `Student: ${studentName}.`,
    `Subject: ${subjectTitle}.`,
    date ? `Date: ${date}.` : "",
    time ? `Time: ${time}.` : "",
    comments ? `Comments: ${comments}.` : "",
    joinUrl ? `Meeting link: ${joinUrl}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const studentDetail = [
    `${tkLabel} (${instructorName}) has been assigned to you.`,
    `Instructor: ${instructorName}.`,
    `Subject: ${subjectTitle}.`,
    date ? `Date: ${date}.` : "",
    time ? `Time: ${time}.` : "",
    comments ? `Comments: ${comments}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const templateData = {
    title: subjectTitle,
    detail: studentDetail,
    instructor: instructorName,
    subjectName: subjectTitle,
    date,
    time,
    comments,
    when,
    joinUrl,
    studentName,
    tkLabel,
  };

  if (student) {
    await notifyUsers([student.id], {
      title: studentSubject,
      body: studentDetail,
      type: "student.instructor_assigned",
      email: false,
      actionUrl: "/student/dashboard",
      data: {
        instructorId: input.instructorId,
        courseId: input.courseId,
        liveClassId: input.liveClassId,
        tkLabel,
      },
    });
    await dispatchEmailEvent({
      event: "assignment",
      userIds: [student.id],
      subject: studentSubject,
      data: {
        ...templateData,
        recipientName: studentName,
        cta: "Open your timetable in AviatorPass",
      },
      actorId: input.actorId,
      system: true,
      meta: { liveClassId: input.liveClassId, tkLabel, audience: "student" },
    });
  }

  const instructorIds = uniqueIds([input.instructorId, ...cgiIds]);
  if (instructorIds.length) {
    await notifyUsers(
      instructorIds.filter((id) => id === input.instructorId),
      {
        title: `${tkLabel} assigned`,
        body: staffDetail,
        type: "instructor.student_assigned",
        email: false,
        actionUrl: "/instructor/dashboard",
        data: {
          studentId: input.studentId,
          courseId: input.courseId,
          liveClassId: input.liveClassId,
          tkLabel,
        },
      },
    );
    if (cgiIds.length) {
      await notifyUsers(cgiIds, {
        title: `${tkLabel} assigned`,
        body: staffDetail,
        type: "cgi.instructor_assignment",
        email: false,
        actionUrl: "/cgi/assignment",
        data: {
          instructorId: input.instructorId,
          studentId: input.studentId,
          courseId: input.courseId,
          liveClassId: input.liveClassId,
          tkLabel,
        },
      });
    }
    await dispatchEmailEvent({
      event: "instructor_alert",
      userIds: instructorIds,
      subject: `${tkLabel} assigned — ${studentName}`,
      data: {
        ...templateData,
        title: `${tkLabel} assigned`,
        detail: staffDetail,
        cta: "Open AviatorPass",
      },
      actorId: input.actorId,
      system: true,
      meta: { liveClassId: input.liveClassId, tkLabel, audience: "instructor" },
    });
  }

  if (adminIds.length) {
    await notifyUsers(adminIds, {
      title: `${tkLabel} assigned`,
      body: staffDetail,
      type: "admin.instructor_assigned",
      email: false,
      actionUrl: "/super-admin",
      data: {
        instructorId: input.instructorId,
        studentId: input.studentId,
        courseId: input.courseId,
        liveClassId: input.liveClassId,
        tkLabel,
      },
    });
    await dispatchEmailEvent({
      event: "admin_alert",
      userIds: adminIds,
      subject: `Copy: ${studentSubject}`,
      data: {
        title: `${tkLabel} assigned`,
        detail: staffDetail,
        reference: input.liveClassId ?? input.courseId ?? tkLabel,
      },
      actorId: input.actorId,
      system: true,
      meta: { liveClassId: input.liveClassId, tkLabel, audience: "admin" },
    });
  }

  return {
    tkLabel,
    studentSubject,
    notifiedUserIds: uniqueIds([student?.id, input.instructorId, ...cgiIds, ...adminIds]),
  };
}
