/**
 * Official ATPL journey: “TK 2 has been assigned to you.”
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import {
  assignedInstructorStudentSubject,
  listNumberedTheoreticalInstructors,
  notifyAtplInstructorAssigned,
  theoreticalKnowledgeLabel,
} from "@/services/cgi/assignment-email";
import { distributeLecture, listAtplCourses } from "@/services/cgi/journey-service";
import { scheduleAssignmentSession } from "@/services/assignment/engine";
import { resetAssignmentDbCache, writeAssignmentDb } from "@/services/assignment/store";
import {
  setAvailabilityWindows,
  ensureDefaultAvailability,
} from "@/services/assignment/availability-service";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { writeClassesDb } from "@/services/classes/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listOutboundEmails } from "@/services/email/outbox";
import { listNotifications } from "@/services/notifications/notification-service";

function newEmails(beforeIds: Set<string>) {
  return listOutboundEmails(120).filter((message) => !beforeIds.has(message.id));
}

function uniqueSlot(offsetHours: number) {
  const start = new Date(Date.now() + 150 * 86_400_000 + offsetHours * 3_600_000);
  start.setUTCMinutes(0, 0, 0);
  return start;
}

describe("official ATPL instructor assignment email", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensureClassesSeeded();
    resetAssignmentDbCache();
    writeAssignmentDb((db) => {
      db.requests = [];
      db.queue = [];
      db.availabilityWindows = [];
      db.availabilityBlocks = [];
    });
  });

  it("numbers CGI as TKI 1 and instructors as TK 2, TK 3, …", () => {
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const instructors = listNumberedTheoreticalInstructors();
    expect(theoreticalKnowledgeLabel(cgi.id)).toBe("TKI 1");
    expect(instructors.length).toBeGreaterThanOrEqual(2);
    expect(theoreticalKnowledgeLabel(instructors[0]!.id)).toBe("TK 2");
    expect(theoreticalKnowledgeLabel(instructors[1]!.id)).toBe("TK 3");
    expect(assignedInstructorStudentSubject("TK 2")).toBe("TK 2 has been assigned to you.");
    const primary = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    expect(theoreticalKnowledgeLabel(primary.id)).toBe("TK 2");
  });

  it("emails student, assigned instructor, TKI 1, and Super User with official fields", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const superAdmin = findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin)!;
    const course = listAtplCourses()[0]!;
    const startsAt = uniqueSlot(4).toISOString();
    const joinUrl = "https://www.aviatorpass.com/live/join/demo-assignment";
    const beforeIds = new Set(listOutboundEmails(120).map((message) => message.id));

    const result = await notifyAtplInstructorAssigned({
      instructorId: instructor.id,
      studentId: student.id,
      courseId: course.id,
      lessonTitle: "Instrumentation",
      scheduledAt: startsAt,
      comments: "Bring the EASA workbook",
      joinUrl,
      actorId: cgi.id,
    });

    expect(result.tkLabel).toBe("TK 2");
    expect(result.studentSubject).toBe("TK 2 has been assigned to you.");
    expect(result.notifiedUserIds).toEqual(
      expect.arrayContaining([student.id, instructor.id, cgi.id, superAdmin.id]),
    );

    const sent = newEmails(beforeIds);
    const toStudent = sent.filter(
      (message) => message.to.toLowerCase() === student.email.toLowerCase(),
    );
    const toInstructor = sent.filter(
      (message) => message.to.toLowerCase() === instructor.email.toLowerCase(),
    );
    const toCgi = sent.filter((message) => message.to.toLowerCase() === cgi.email.toLowerCase());
    const toSa = sent.filter(
      (message) => message.to.toLowerCase() === superAdmin.email.toLowerCase(),
    );

    expect(toStudent.some((message) => message.subject === "TK 2 has been assigned to you.")).toBe(
      true,
    );
    const studentMail = toStudent.find(
      (message) => message.subject === "TK 2 has been assigned to you.",
    )!;
    expect(studentMail.html).toMatch(/Instructor:/i);
    expect(studentMail.html).toMatch(/Subject:/i);
    expect(studentMail.html).toMatch(/Date:/i);
    expect(studentMail.html).toMatch(/Time:/i);
    expect(studentMail.html).toMatch(/Comments:/i);
    expect(studentMail.html).toContain("Bring the EASA workbook");
    expect(studentMail.html).toContain(joinUrl);

    expect(toInstructor.length).toBeGreaterThan(0);
    expect(toCgi.length).toBeGreaterThan(0);
    expect(toSa.length).toBeGreaterThan(0);
    expect([...toInstructor, ...toCgi].some((message) => /assigned/i.test(message.subject))).toBe(
      true,
    );
    expect(toSa.some((message) => /TK 2 has been assigned to you/i.test(message.subject))).toBe(
      true,
    );
    expect(
      [...toInstructor, ...toCgi, ...toSa].some(
        (message) =>
          message.html.includes(student.email.split("@")[0]!) ||
          message.text.includes("Omar") ||
          /Student:/i.test(message.html),
      ),
    ).toBe(true);

    expect(
      listNotifications(student.id).data.some((row) => row.type === "student.instructor_assigned"),
    ).toBe(true);
    expect(
      listNotifications(instructor.id).data.some(
        (row) => row.type === "instructor.student_assigned",
      ),
    ).toBe(true);
    expect(
      listNotifications(cgi.id).data.some((row) => row.type === "cgi.instructor_assignment"),
    ).toBe(true);
    expect(
      listNotifications(superAdmin.id).data.some((row) => row.type === "admin.instructor_assigned"),
    ).toBe(true);
  });

  it("sends the official student subject when TKI 1 distributes a lecture", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const course = listAtplCourses()[0]!;
    const beforeIds = new Set(listOutboundEmails(120).map((message) => message.id));

    const lecture = await distributeLecture({
      courseId: course.id,
      lessonId: "lesson-tk-assigned",
      lessonTitle: "Met briefing",
      instructorId: instructor.id,
      studentId: student.id,
      notes: "First subject after Instrumentation",
      actorId: cgi.id,
    });

    expect(lecture.status).toBe("assigned");
    const sent = newEmails(beforeIds);
    expect(
      sent.some(
        (message) =>
          message.to.toLowerCase() === student.email.toLowerCase() &&
          message.subject === "TK 2 has been assigned to you.",
      ),
    ).toBe(true);
    expect(sent.some((message) => message.subject === "Class scheduled")).toBe(false);
    expect(sent.some((message) => /New assignment/i.test(message.subject))).toBe(false);
  });

  it(
    "replaces the generic assignment-engine email when a session is scheduled",
    { timeout: 120_000 },
    async () => {
      const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
      const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
      const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
      const course = listAtplCourses()[0]!;
      const start = uniqueSlot(9);

      ensureDefaultAvailability(instructor.id);
      setAvailabilityWindows({
        instructorId: instructor.id,
        windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startTime: "00:00",
          endTime: "23:59",
          timezone: "UTC",
        })),
      });
      writeClassesDb((db) => {
        for (const row of db.classes) {
          if (row.instructorId !== instructor.id) continue;
          if (Date.parse(row.startsAt) < Date.now() + 100 * 86_400_000) continue;
          row.status = "cancelled";
          row.cancelledAt = new Date().toISOString();
        }
      });

      const beforeIds = new Set(listOutboundEmails(120).map((message) => message.id));
      const scheduled = await scheduleAssignmentSession({
        createRequest: {
          courseId: course.id,
          instructorId: instructor.id,
          lessonTitle: `Open ATPL session ${Date.now()}`,
          preferredStartsAt: start.toISOString(),
          durationMinutes: 60,
          studentId: student.id,
          actorId: cgi.id,
          autoZoom: true,
        },
        startsAt: start.toISOString(),
        actorId: cgi.id,
      });
      expect(scheduled.outcome).toBe("scheduled");

      const sent = newEmails(beforeIds);
      expect(
        sent.some(
          (message) =>
            message.to.toLowerCase() === student.email.toLowerCase() &&
            message.subject === "TK 2 has been assigned to you.",
        ),
      ).toBe(true);
      expect(
        sent.some((message) =>
          /ATPL assignment engine scheduled a live session/i.test(message.text),
        ),
      ).toBe(false);
      expect(sent.some((message) => message.subject === "New assignment")).toBe(false);
      expect(sent.some((message) => message.subject === "Class scheduled")).toBe(false);
    },
  );
});
