/**
 * Isolated Marketplace reviewer classroom.
 * Creates one class for the dedicated reviewer instructor and student only
 * after that instructor has authorized a personal Zoom account.
 * Never reads or updates any other class.
 */

import { ROLES } from "@/constants/roles";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import { createLiveClass, enrollStudentsInLiveClass } from "@/services/classes/class-service";
import {
  listParticipantsForClass,
  lookupAllLiveClasses,
  lookupZoomMeetingByClassId,
} from "@/services/classes/store";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { getInstructorZoomStatus } from "@/services/zoom/oauth-service";
import type { LiveClass } from "@/types/classes";

export const REVIEWER_INSTRUCTOR_EMAIL = "zoom.reviewer.instructor@aviatorpass.com";
export const REVIEWER_STUDENT_EMAIL = "zoom.reviewer.student@aviatorpass.com";
export const REVIEWER_CLASS_TITLE = "Marketplace reviewer classroom — ATPL meteorology";

const PLATFORM_ZOOM_EMAILS = ["ceo@aviatorpass.com"];

export type ReviewerClassroomBlock =
  | "instructor_missing"
  | "student_missing"
  | "oauth_not_connected"
  | "shared_platform_zoom"
  | "zoom_email_missing"
  | "customer_zoom_email";

export type ReviewerClassroomAssessment = {
  ready: boolean;
  block: ReviewerClassroomBlock | null;
  message: string;
  zoomEmail: string | null;
};

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function assessReviewerClassroom(input: {
  instructorFound: boolean;
  studentFound: boolean;
  personalZoomReady: boolean;
  sharedPlatformAccount: boolean;
  zoomEmail: string | null;
  protectedEmails: string[];
}): ReviewerClassroomAssessment {
  if (!input.instructorFound) {
    return {
      ready: false,
      block: "instructor_missing",
      message: "The dedicated reviewer instructor account is not available.",
      zoomEmail: null,
    };
  }
  if (!input.studentFound) {
    return {
      ready: false,
      block: "student_missing",
      message: "The dedicated reviewer student account is not available.",
      zoomEmail: null,
    };
  }
  if (input.sharedPlatformAccount) {
    return {
      ready: false,
      block: "shared_platform_zoom",
      message:
        "The reviewer instructor is connected to the shared platform Zoom account. Connect a dedicated Zoom user instead. The platform account cannot host this classroom.",
      zoomEmail: input.zoomEmail,
    };
  }
  if (!input.personalZoomReady) {
    return {
      ready: false,
      block: "oauth_not_connected",
      message:
        "The reviewer instructor has not authorized a personal Zoom account. Connect Zoom on the instructor profile with a dedicated Zoom user before creating the reviewer classroom.",
      zoomEmail: input.zoomEmail,
    };
  }
  const zoomEmail = normalizeEmail(input.zoomEmail);
  if (!zoomEmail) {
    return {
      ready: false,
      block: "zoom_email_missing",
      message:
        "Zoom did not return an email for the connected instructor. Reconnect a dedicated Zoom user so the meeting owner is known.",
      zoomEmail: null,
    };
  }
  const protectedEmails = new Set(input.protectedEmails.map(normalizeEmail).filter(Boolean));
  if (protectedEmails.has(zoomEmail) || PLATFORM_ZOOM_EMAILS.includes(zoomEmail)) {
    return {
      ready: false,
      block: "customer_zoom_email",
      message:
        "The connected Zoom email belongs to another AviatorPass account or the platform host. Authorize a dedicated Zoom user that is not a customer and not the platform host.",
      zoomEmail,
    };
  }
  return {
    ready: true,
    block: null,
    message: "The reviewer instructor can host a dedicated classroom on the connected Zoom user.",
    zoomEmail,
  };
}

export function selectReviewerClass(
  classes: LiveClass[],
  participantUserIdsByClass: Map<string, string[]>,
  instructorId: string,
  studentId: string,
): LiveClass | null {
  const matches = classes.filter(
    (cls) =>
      cls.instructorId === instructorId &&
      cls.title === REVIEWER_CLASS_TITLE &&
      !cls.deletedAt &&
      cls.status !== "cancelled",
  );
  const withStudent = matches.filter((cls) =>
    (participantUserIdsByClass.get(cls.id) ?? []).includes(studentId),
  );
  const pool = withStudent.length ? withStudent : matches;
  return pool.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}

function protectedAccountEmails(): string[] {
  const platform = getPlatformSettings().zoom.accountEmail;
  const users = readAuthDb().users ?? [];
  return [
    platform ?? "",
    ...PLATFORM_ZOOM_EMAILS,
    ...users
      .filter((user) => normalizeEmail(user.email) !== REVIEWER_INSTRUCTOR_EMAIL)
      .map((user) => user.email),
  ];
}

export type ReviewerClassroomResult = ReviewerClassroomAssessment & {
  created: boolean;
  classId: string | null;
  joinPath: string | null;
  startsAt: string | null;
  meetingOwner: string | null;
  meetingCreated: boolean;
  studentEnrolled: boolean;
};

function resultFromClass(
  assessment: ReviewerClassroomAssessment,
  cls: LiveClass | null,
  created: boolean,
  studentId: string,
): ReviewerClassroomResult {
  const participants = cls ? listParticipantsForClass(cls.id) : [];
  const meeting = cls ? lookupZoomMeetingByClassId(cls.id) : null;
  return {
    ...assessment,
    created,
    classId: cls?.id ?? null,
    joinPath: cls ? `/join/${cls.id}` : null,
    startsAt: cls?.startsAt ?? null,
    meetingOwner: assessment.zoomEmail,
    meetingCreated: Boolean(meeting?.zoomMeetingId),
    studentEnrolled: participants.some(
      (row) => row.userId === studentId && row.role === "participant",
    ),
  };
}

export async function prepareReviewerClassroom(actorId: string): Promise<ReviewerClassroomResult> {
  const instructor = findUserByEmail(REVIEWER_INSTRUCTOR_EMAIL);
  const student = findUserByEmail(REVIEWER_STUDENT_EMAIL);
  const instructorFound = Boolean(instructor && instructor.role === ROLES.INSTRUCTOR);
  const studentFound = Boolean(student && student.role === ROLES.STUDENT);
  const status = instructorFound && instructor ? getInstructorZoomStatus(instructor.id) : null;
  const assessment = assessReviewerClassroom({
    instructorFound,
    studentFound,
    personalZoomReady: Boolean(status?.personalZoomReady),
    sharedPlatformAccount: Boolean(status?.sharedPlatformAccount),
    zoomEmail: status?.zoomEmail ?? null,
    protectedEmails: protectedAccountEmails(),
  });

  if (!assessment.ready || !instructor || !student) {
    return resultFromClass(assessment, null, false, student?.id ?? "");
  }

  const classes = lookupAllLiveClasses();
  const participantMap = new Map<string, string[]>();
  for (const cls of classes) {
    if (cls.instructorId !== instructor.id || cls.title !== REVIEWER_CLASS_TITLE) continue;
    participantMap.set(
      cls.id,
      listParticipantsForClass(cls.id).map((row) => row.userId),
    );
  }
  const existing = selectReviewerClass(classes, participantMap, instructor.id, student.id);
  if (existing) {
    const enrolled = (participantMap.get(existing.id) ?? []).includes(student.id);
    if (!enrolled) enrollStudentsInLiveClass(existing.id, [student.id]);
    return resultFromClass(assessment, existing, false, student.id);
  }

  const startsAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const created = await createLiveClass({
    title: REVIEWER_CLASS_TITLE,
    description:
      "Isolated Zoom Marketplace reviewer classroom for AviatorPass Classroom for Zoom. Not a customer session.",
    instructorId: instructor.id,
    startsAt,
    durationMinutes: 30,
    timezone: "Asia/Kuwait",
    maxStudents: 2,
    enrollStudentIds: [student.id],
    actorId,
    omitScheduleEmail: true,
  });
  return resultFromClass(assessment, created, true, student.id);
}
