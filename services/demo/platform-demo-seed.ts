/**
 * Orchestrates permanent demo accounts + realistic domain demo data.
 * Idempotent — safe to call on every auth/OTP boot when demo mode is enabled.
 */

import { addDays, addHours } from "date-fns";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import {
  atplPackageSubjectOrderIndex,
  easaCodeFromAtplCourseCode,
  ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
  ATPL_PACKAGE_OPENING_SUBJECT_CODE,
  ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
  formatAtplFirstLectureTitle,
} from "@/constants/atpl-complete-package";
import { generateId } from "@/lib/security/crypto";
import { ensureAiSeeded } from "@/services/ai/seed";
import { ensureAnalyticsSeeded } from "@/services/analytics/seed";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, writeAuthDb } from "@/services/auth/store";
import { ensureCertificatesSeeded } from "@/services/certificates/seed";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { appJoinUrl } from "@/lib/site-origin";
import { siteStatic } from "@/config/site-static";
import { readClassesDb, writeClassesDb } from "@/services/classes/store";
import { ensureCommunicationSeeded } from "@/services/communication/seed";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb, writeCoursesDb } from "@/services/courses/store";
import { writeCgiDb, readCgiDb } from "@/services/cgi/store";
import { ensureLearningSeeded } from "@/services/learning/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { ensureWrittenExamsSeeded } from "@/services/mock-exams/written-exam-service";
import { writeBookingsDb, readBookingsDb } from "@/services/bookings/store";
import { isLiveZoomConfigured, isPlaceholderZoomMeeting } from "@/services/classes/zoom-service";
import { writePerformanceDb, readPerformanceDb } from "@/services/performance/store";
import type { AppointmentBooking } from "@/types/bookings";
import type { NotificationRecord } from "@/types/index";
import type { AtplSubjectAssignment, AtplLectureAssignment, CgiOversightNote } from "@/types/cgi";
import type { PerformanceReport } from "@/types/performance-reports";
import type { LiveClass, MeetingParticipant, ZoomMeetingRecord } from "@/types/classes";

let seededInProcess = false;

export function ensurePlatformDemoEnvironment(): void {
  if (seededInProcess) return;
  seededInProcess = true;

  try {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensureClassesSeeded();
    ensurePaymentsSeeded();
    ensureCommunicationSeeded();
    ensureCertificatesSeeded();
    ensureLearningSeeded();
    ensureWrittenExamsSeeded();
    ensureAnalyticsSeeded();
    ensureAiSeeded();

    enrollPrimaryStudentInAtplProgram();
    seedDemoNotifications();
    seedDemoBookings();
    seedCgiOversightData();
    ensureDemoOpeningLecture();
    seedPerformanceDemoReport();
  } finally {
    // Allow re-entry after full cycle if stores were reset.
    seededInProcess = false;
  }
}

function primaryStudent() {
  return findUserByEmail(PRIMARY_DEMO_EMAILS.student);
}

function primaryInstructor() {
  return findUserByEmail(PRIMARY_DEMO_EMAILS.instructor);
}

function primaryCgi() {
  return findUserByEmail(PRIMARY_DEMO_EMAILS.cgi);
}

function primarySuperAdmin() {
  return findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin);
}

/** Enrol Omar (primary student) in every published ATPL subject. */
function enrollPrimaryStudentInAtplProgram(): void {
  const student = primaryStudent();
  const actor = primarySuperAdmin();
  if (!student || !actor) return;

  const ts = new Date().toISOString();
  writeCoursesDb((d) => {
    const atplCourses = d.courses.filter(
      (c) =>
        !c.deletedAt &&
        c.status === "published" &&
        (c.code?.startsWith("ATPL-") || c.tags?.includes("atpl")),
    );

    for (const course of atplCourses) {
      const existing = d.enrollments.find(
        (e) =>
          e.courseId === course.id &&
          e.studentId === student.id &&
          !["dropped", "rejected"].includes(e.status),
      );
      if (existing) {
        // Demo reset must restore ATPL access even if CGI/journey tests left
        // enrollments suspended.
        if (existing.status !== "approved") {
          existing.status = "approved";
          existing.approvedAt = existing.approvedAt ?? ts;
          existing.suspendedAt = null;
          existing.updatedAt = ts;
        }
        continue;
      }

      const enrollment: Enrollment = {
        id: generateId(),
        courseId: course.id,
        studentId: student.id,
        status: "approved",
        enrolledById: actor.id,
        enrolledAt: ts,
        approvedAt: ts,
        completedAt: null,
        droppedAt: null,
        suspendedAt: null,
        notes: "Permanent demo — ATPL Program package",
        updatedAt: ts,
      };
      d.enrollments.push(enrollment);
    }
  });
}

function seedDemoNotifications(): void {
  const student = primaryStudent();
  const instructor = primaryInstructor();
  if (!student || !instructor) return;

  writeAuthDb((d) => {
    const hasDemo = d.notifications.some(
      (n) => n.userId === student.id && n.data?.demoSeed === true,
    );
    if (hasDemo) return;

    const now = new Date();
    const samples: Array<Omit<NotificationRecord, "id">> = [
      {
        userId: student.id,
        title: "Upcoming live session",
        body: "ATPL 010 Live — Air Law Briefing starts soon. Join from your dashboard calendar.",
        channel: "in_app",
        type: "class_reminder",
        category: "classes",
        priority: "high",
        actionUrl: "/student/calendar",
        status: "unread",
        data: { demoSeed: true },
        readAt: null,
        createdAt: addHours(now, -2).toISOString(),
      },
      {
        userId: student.id,
        title: "New message from your instructor",
        body: "Your AviatorPass instructor replied about the NOTAM interpretation question.",
        channel: "in_app",
        type: "message",
        category: "messaging",
        priority: "medium",
        actionUrl: "/student/messages",
        status: "unread",
        data: { demoSeed: true },
        readAt: null,
        createdAt: addHours(now, -5).toISOString(),
      },
      {
        userId: student.id,
        title: "Certificate issued",
        body: "Your sample completion certificate is ready to download and verify.",
        channel: "in_app",
        type: "certificate",
        category: "certificates",
        priority: "informational",
        actionUrl: "/student/certificates",
        status: "read",
        data: { demoSeed: true },
        readAt: addHours(now, -20).toISOString(),
        createdAt: addDays(now, -2).toISOString(),
      },
      {
        userId: student.id,
        title: "Invoice paid",
        body: "Payment received for your ATPL Program package. Receipt is in Billing.",
        channel: "in_app",
        type: "payment",
        category: "billing",
        priority: "medium",
        actionUrl: "/student/billing",
        status: "read",
        data: { demoSeed: true },
        readAt: addDays(now, -3).toISOString(),
        createdAt: addDays(now, -3).toISOString(),
      },
      {
        userId: instructor.id,
        title: "New student enrolled",
        body: "Omar Khalil enrolled in ATPL Air Law. Review his progress before the next live class.",
        channel: "in_app",
        type: "enrollment",
        category: "students",
        priority: "medium",
        actionUrl: "/instructor/students",
        status: "unread",
        data: { demoSeed: true },
        readAt: null,
        createdAt: addHours(now, -1).toISOString(),
      },
    ];

    for (const sample of samples) {
      d.notifications.push({ id: generateId(), ...sample });
    }
  });
}

function stripPlaceholderDemoZoom(): void {
  if (!isLiveZoomConfigured()) return;
  writeBookingsDb((draft) => {
    draft.bookings = draft.bookings.map((booking) => {
      if (!isPlaceholderZoomMeeting(booking.zoom)) return booking;
      return { ...booking, zoom: null };
    });
  });
}

function seedDemoBookings(): void {
  const student = primaryStudent();
  const instructor = primaryInstructor();
  if (!student || !instructor) return;

  stripPlaceholderDemoZoom();

  const db = readBookingsDb();
  const hasDemo = db.bookings.some(
    (b) => b.studentId === student.id && b.notes?.includes("Permanent demo"),
  );
  if (hasDemo) return;

  const sessionType = db.settings.sessionTypes.find((s) => s.active) ?? db.settings.sessionTypes[0];
  if (!sessionType) return;

  const now = new Date();
  const upcomingStart = addDays(now, 2);
  upcomingStart.setHours(16, 0, 0, 0);
  const upcomingEnd = addHours(upcomingStart, sessionType.durationMinutes / 60);

  const pastStart = addDays(now, -5);
  pastStart.setHours(11, 0, 0, 0);
  const pastEnd = addHours(pastStart, sessionType.durationMinutes / 60);

  const stamp = now.toISOString();
  const bookings: AppointmentBooking[] = [
    {
      id: generateId(),
      studentId: student.id,
      instructorId: instructor.id,
      sessionTypeId: sessionType.id,
      sessionTypeName: sessionType.name,
      title: "Private Session — Meteorology review",
      notes: "Permanent demo booking — upcoming coaching",
      startsAt: upcomingStart.toISOString(),
      endsAt: upcomingEnd.toISOString(),
      status: "confirmed",
      zoom: isLiveZoomConfigured()
        ? null
        : {
            meetingNumber: "900100200",
            joinUrl: "https://zoom.us/j/900100200",
            startUrl: "https://zoom.us/s/900100200",
            password: "demo",
            waitingRoom: true,
            providerMode: "mock",
            provisionedAt: stamp,
          },
      guestEmail: null,
      guestFirstName: null,
      guestLastName: null,
      guestVerified: true,
      createdAt: stamp,
      updatedAt: stamp,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      priceAmountMinor: sessionType.priceAmountMinor,
      currency: sessionType.currency,
      paymentRequired: sessionType.paymentRequired,
      paymentOrderId: null,
      paidAt: stamp,
    },
    {
      id: generateId(),
      studentId: student.id,
      instructorId: instructor.id,
      sessionTypeId: sessionType.id,
      sessionTypeName: sessionType.name,
      title: "Private Session — Navigation charts",
      notes: "Permanent demo booking — completed",
      startsAt: pastStart.toISOString(),
      endsAt: pastEnd.toISOString(),
      status: "completed",
      zoom: null,
      guestEmail: null,
      guestFirstName: null,
      guestLastName: null,
      guestVerified: true,
      createdAt: addDays(now, -6).toISOString(),
      updatedAt: pastEnd.toISOString(),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      priceAmountMinor: sessionType.priceAmountMinor,
      currency: sessionType.currency,
      paymentRequired: false,
      paymentOrderId: null,
      paidAt: null,
    },
  ];

  writeBookingsDb((d) => {
    d.bookings.push(...bookings);
    d.seeded = true;
  });
}

export function ensureDemoOpeningLecture(): void {
  const student = primaryStudent();
  const instructor = primaryInstructor();
  const cgi = primaryCgi();
  if (!student || !instructor || !cgi) return;

  const courses = readCoursesDb().courses.filter((course) => !course.deletedAt);
  const opening =
    courses.find((course) => course.code === "ATPL-022") ??
    courses.find((course) => /instrumentation/i.test(course.title));
  if (!opening) return;

  const demoPlan = readCgiDb().subjectAssignments.filter(
    (row) => row.studentId === student.id && row.notes === "Permanent demo subject plan",
  );
  if (demoPlan.length === 0) return;

  const title = formatAtplFirstLectureTitle(ATPL_PACKAGE_OPENING_SUBJECT_TITLE);
  const existing = readClassesDb().classes.find(
    (row) =>
      !row.deletedAt &&
      row.instructorId === instructor.id &&
      row.title === title &&
      row.status !== "cancelled",
  );
  const starts = existing ? new Date(existing.startsAt) : addDays(new Date(), 1);
  const ends = existing ? new Date(existing.endsAt) : addHours(starts, 1);
  const classId = existing?.id ?? generateId();
  const now = new Date().toISOString();

  if (!existing) {
    const liveZoom = isLiveZoomConfigured();
    const zoomId = liveZoom ? null : generateId();
    const zoomMeetingId = liveZoom
      ? ""
      : String(Math.floor(100_000_000 + Math.random() * 899_999_999));
    const liveClass: LiveClass = {
      id: classId,
      title,
      description: "Opening ATPL lecture assigned by TKI 1.",
      courseId: opening.id,
      moduleId: null,
      lessonId: ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
      instructorId: instructor.id,
      assistantInstructorId: null,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      timezone: "Asia/Kuwait",
      maxStudents: 1,
      meetingType: "meeting",
      status: "scheduled",
      zoomMeetingId: zoomId,
      recurringRuleId: null,
      parentClassId: null,
      cancelledAt: null,
      cancelReason: null,
      rescheduledFromId: null,
      createdById: cgi.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const participants: MeetingParticipant[] = [
      {
        id: generateId(),
        liveClassId: classId,
        userId: instructor.id,
        role: "host",
        invitedAt: now,
        joinedAt: null,
      },
      {
        id: generateId(),
        liveClassId: classId,
        userId: student.id,
        role: "participant",
        invitedAt: now,
        joinedAt: null,
      },
    ];
    const meetings: ZoomMeetingRecord[] = zoomId
      ? [
          {
            id: zoomId,
            liveClassId: classId,
            zoomMeetingId,
            zoomUuid: generateId(),
            joinUrl: appJoinUrl(classId, zoomMeetingId),
            startUrl: appJoinUrl(classId, zoomMeetingId, true),
            password: "AtplLive1",
            hostEmail: siteStatic.supportEmail,
            waitingRoom: true,
            passcodeEnabled: true,
            coHostEmails: [],
            providerMode: "mock",
            raw: { seeded: true },
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];
    writeClassesDb((draft) => {
      draft.classes.push(liveClass);
      draft.participants.push(...participants);
      draft.zoomMeetings.push(...meetings);
    });
  }

  const cgiPreview = readCgiDb();
  const currentDemoPlan = cgiPreview.subjectAssignments.filter(
    (row) => row.studentId === student.id && row.notes === "Permanent demo subject plan",
  );
  if (currentDemoPlan.length === 0) return;
  const openDemo = currentDemoPlan.filter(
    (row) => row.status === "available" || row.status === "in_progress",
  );
  const linked = cgiPreview.lectureAssignments.find(
    (row) =>
      row.studentId === student.id &&
      row.notes === "Permanent demo lecture assignment" &&
      row.lessonId === ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID &&
      row.status === "scheduled" &&
      row.liveClassId === classId,
  );
  if (openDemo.length === 1 && linked) return;

  writeCgiDb((draft) => {
    const plan = draft.subjectAssignments.filter(
      (row) => row.studentId === student.id && row.notes === "Permanent demo subject plan",
    );
    for (const row of plan) {
      const code = easaCodeFromAtplCourseCode(row.subjectCode);
      const openingRow = code === ATPL_PACKAGE_OPENING_SUBJECT_CODE || row.courseId === opening.id;
      if (!openingRow && (row.status === "available" || row.status === "in_progress")) {
        row.status = "locked";
        row.unlockedAt = null;
        row.updatedAt = now;
      }
      if (openingRow && row.status !== "completed") {
        row.status = "in_progress";
        row.unlockedAt = row.unlockedAt ?? now;
        row.assignedInstructorId = instructor.id;
        row.updatedAt = now;
      }
    }
    draft.lectureAssignments = draft.lectureAssignments.filter(
      (row) => row.studentId !== student.id || row.notes !== "Permanent demo lecture assignment",
    );
    draft.lectureAssignments.push({
      id: generateId(),
      courseId: opening.id,
      lessonId: ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
      lessonTitle: ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
      instructorId: instructor.id,
      studentId: student.id,
      status: "scheduled",
      scheduledAt: starts.toISOString(),
      liveClassId: classId,
      notes: "Permanent demo lecture assignment",
      assignedById: cgi.id,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function seedCgiOversightData(): void {
  const student = primaryStudent();
  const instructor = primaryInstructor();
  const cgi = primaryCgi();
  if (!student || !instructor || !cgi) return;

  const cgiDb = readCgiDb();
  const hasStudentPlan = cgiDb.subjectAssignments.some((s) => s.studentId === student.id);
  if (hasStudentPlan) return;

  const courses = readCoursesDb()
    .courses.filter((c) => !c.deletedAt && c.status === "published" && c.code?.startsWith("ATPL-"))
    .sort(
      (a, b) =>
        atplPackageSubjectOrderIndex(easaCodeFromAtplCourseCode(a.code)) -
        atplPackageSubjectOrderIndex(easaCodeFromAtplCourseCode(b.code)),
    );
  if (courses.length === 0) return;

  const ts = new Date().toISOString();

  const subjects: AtplSubjectAssignment[] = courses.map((course, index) => ({
    id: generateId(),
    studentId: student.id,
    courseId: course.id,
    subjectCode: course.code ?? `ATPL-${index + 1}`,
    sortOrder: index + 1,
    status: index === 0 ? "in_progress" : "locked",
    assignedInstructorId: instructor.id,
    unlockedAt: index === 0 ? ts : null,
    completedAt: null,
    notes: "Permanent demo subject plan",
    assignedById: cgi.id,
    createdAt: ts,
    updatedAt: ts,
  }));

  const firstCourse =
    courses.find((course) => course.code === "ATPL-022") ??
    courses.find((course) => /instrumentation/i.test(course.title)) ??
    courses[0];
  const lectures: AtplLectureAssignment[] = firstCourse
    ? [
        {
          id: generateId(),
          courseId: firstCourse.id,
          lessonId: ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID,
          lessonTitle: ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
          instructorId: instructor.id,
          studentId: student.id,
          status: "scheduled",
          scheduledAt: addDays(new Date(), 1).toISOString(),
          liveClassId: null,
          notes: "Permanent demo lecture assignment",
          assignedById: cgi.id,
          createdAt: ts,
          updatedAt: ts,
        },
      ]
    : [];

  const notes: CgiOversightNote[] = [
    {
      id: generateId(),
      targetType: "student",
      targetUserId: student.id,
      body: "Omar is progressing well through Air Law — keep Mass & Balance unlocked next.",
      authorId: cgi.id,
      createdAt: ts,
    },
    {
      id: generateId(),
      targetType: "instructor",
      targetUserId: instructor.id,
      body: "Please confirm next week's Navigation Chart Clinic attendance list.",
      authorId: cgi.id,
      createdAt: ts,
    },
  ];

  writeCgiDb((d) => {
    // Replace prior demo plans for this student; keep other students' rows.
    d.subjectAssignments = [
      ...d.subjectAssignments.filter((s) => s.studentId !== student.id),
      ...subjects,
    ];
    d.lectureAssignments = [
      ...d.lectureAssignments.filter((l) => l.studentId !== student.id),
      ...lectures,
    ];
    const existingNoteKeys = new Set(d.notes.map((n) => `${n.targetUserId}:${n.body}`));
    for (const note of notes) {
      if (!existingNoteKeys.has(`${note.targetUserId}:${note.body}`)) d.notes.push(note);
    }
    d.settings.defaultFirstSubjectCourseId =
      firstCourse?.id ?? d.settings.defaultFirstSubjectCourseId;
    d.settings.openingDefaultHealedAt = d.settings.openingDefaultHealedAt ?? ts;
    d.settings.updatedAt = ts;
    d.settings.updatedById = cgi.id;
    d.seeded = true;
  });
}

function seedPerformanceDemoReport(): void {
  const student = primaryStudent();
  const instructor = primaryInstructor();
  if (!student || !instructor) return;

  const perf = readPerformanceDb();
  if (perf.seeded && perf.reports.length > 0) return;

  const liveClass =
    readClassesDb().classes.find((c) => c.status === "completed") ?? readClassesDb().classes[0];
  if (!liveClass) {
    writePerformanceDb((d) => {
      d.seeded = true;
    });
    return;
  }

  const course = liveClass.courseId
    ? readCoursesDb().courses.find((c) => c.id === liveClass.courseId)
    : null;
  const ts = new Date().toISOString();

  const report: PerformanceReport = {
    id: generateId(),
    liveClassId: liveClass.id,
    classTitle: liveClass.title,
    courseId: liveClass.courseId,
    courseCode: course?.code ?? null,
    studentId: student.id,
    instructorId: instructor.id,
    todaysTopic: "ICAO annexes & licensing privileges",
    nextTopic: "Rules of the air & aerodrome operations",
    homework: "Complete Module 1 practice questions (sets A–C).",
    performance: "good",
    questionBank: "Air Law QB — Chapters 1–2",
    comments: "Permanent demo performance review — strong participation in live class.",
    emailSentAt: null,
    emailOutboxId: null,
    createdById: instructor.id,
    createdAt: ts,
    updatedAt: ts,
  };

  writePerformanceDb((d) => {
    d.reports = [report];
    d.seeded = true;
  });
}
