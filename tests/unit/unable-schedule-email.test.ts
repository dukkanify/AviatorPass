/**
 * Official ATPL journey: Unable to Schedule emails the instructor, TKI 1,
 * and Super Admin, and sets the student to Scheduling Required.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import {
  assignInstructorEngine,
  listAssignmentRequests,
  reconcileDuplicateOpenAssignmentRequests,
  reassignInstructorEngine,
  reportUnableToScheduleNextLecture,
  scheduleAssignmentSession,
} from "@/services/assignment/engine";
import { resetAssignmentDbCache, writeAssignmentDb } from "@/services/assignment/store";
import { createLiveClass } from "@/services/classes/class-service";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { writeClassesDb } from "@/services/classes/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb } from "@/services/courses/store";
import { listOutboundEmails } from "@/services/email/outbox";
import { listNotifications } from "@/services/notifications/notification-service";

function uniqueSlot(offsetHours: number) {
  const start = new Date(Date.now() + 140 * 86_400_000 + offsetHours * 3_600_000);
  start.setUTCMinutes(0, 0, 0);
  const ends = new Date(start.getTime() + 60 * 60_000);
  return { start, ends };
}

function newEmails(beforeIds: Set<string>) {
  return listOutboundEmails(80).filter((m) => !beforeIds.has(m.id));
}

describe("unable to schedule next lecture", () => {
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
      db.settings.lookAheadDays = 14;
    });
  });

  it("marks Scheduling Required and emails TKI 1 and Super Admin", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const superAdmin = findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin)!;
    const course = readCoursesDb().courses.find((c) => /^ATPL-/i.test(c.code) && !c.deletedAt)!;
    const { start, ends } = uniqueSlot(3);

    writeClassesDb((d) => {
      for (const c of d.classes) {
        if (c.instructorId !== instructor.id) continue;
        if (Date.parse(c.startsAt) < Date.now() + 100 * 86_400_000) continue;
        c.status = "cancelled";
        c.cancelledAt = new Date().toISOString();
      }
    });

    const live = await createLiveClass({
      title: `ATPL follow-up ${Date.now()}`,
      instructorId: instructor.id,
      courseId: course.id,
      startsAt: start.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      status: "completed",
      enrollStudentIds: [student.id],
      actorId: instructor.id,
    });
    expect(live?.id).toBeTruthy();

    const beforeIds = new Set(listOutboundEmails(80).map((m) => m.id));
    const result = await reportUnableToScheduleNextLecture({
      liveClassId: live!.id,
      studentId: student.id,
      reason: "No matching slot this week",
      actorId: instructor.id,
    });

    expect(result.request.status).toBe("scheduling_required");
    expect(result.request.unableReason).toBe("No matching slot this week");
    expect(result.studentId).toBe(student.id);
    expect(result.notifiedUserIds).toEqual(
      expect.arrayContaining([cgi.id, superAdmin.id, instructor.id]),
    );
    expect(
      listAssignmentRequests({ courseId: course.id }).some(
        (r) => r.studentId === student.id && r.status === "scheduling_required",
      ),
    ).toBe(true);

    const sent = newEmails(beforeIds);
    const toCgi = sent.filter((m) => m.to.toLowerCase() === cgi.email.toLowerCase());
    const toSa = sent.filter((m) => m.to.toLowerCase() === superAdmin.email.toLowerCase());
    const toInstructor = sent.filter((m) => m.to.toLowerCase() === instructor.email.toLowerCase());
    expect(toCgi.length).toBeGreaterThan(0);
    expect(toSa.length).toBeGreaterThan(0);
    expect(toInstructor.length).toBeGreaterThan(0);
    expect([...toCgi, ...toSa].some((m) => /unable to schedule/i.test(m.subject))).toBe(true);
    const adminCopy = sent.filter((m) => /unable to schedule/i.test(m.subject));
    expect(adminCopy.length).toBeGreaterThanOrEqual(3);
    expect(
      listNotifications(instructor.id).data.some((n) => n.type === "instructor.unable_to_schedule"),
    ).toBe(true);

    expect(listNotifications(cgi.id).data.some((n) => n.type === "cgi.unable_to_schedule")).toBe(
      true,
    );
    expect(
      listNotifications(superAdmin.id).data.some((n) => n.type === "admin.unable_to_schedule"),
    ).toBe(true);
  });

  it("keeps one Scheduling Required card when TKI 1 reassigns after Unable", async () => {
    const instructors = readAuthDb().users.filter((u) => u.role === ROLES.INSTRUCTOR);
    const instructorA = instructors[0]!;
    const instructorB = instructors[1] ?? instructors[0]!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find((c) => /^ATPL-/i.test(c.code) && !c.deletedAt)!;
    const { start, ends } = uniqueSlot(31);

    const live = await createLiveClass({
      title: `ATPL unable-reassign ${Date.now()}`,
      instructorId: instructorA.id,
      courseId: course.id,
      startsAt: start.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      status: "completed",
      enrollStudentIds: [student.id],
      actorId: instructorA.id,
    });
    expect(live?.id).toBeTruthy();

    const unable = await reportUnableToScheduleNextLecture({
      liveClassId: live!.id,
      studentId: student.id,
      reason: "No agreed time",
      actorId: instructorA.id,
    });
    expect(unable.request.status).toBe("scheduling_required");

    // Simulate stacked historical opens (old bug).
    writeAssignmentDb((db) => {
      const stamp = new Date().toISOString();
      db.requests.unshift({
        ...unable.request,
        id: `dup-${Date.now()}`,
        instructorId: instructorB.id,
        status: "scheduling_required",
        unableReason: null,
        createdAt: stamp,
        updatedAt: stamp,
        notes: "Stale reassign open",
      });
    });
    expect(
      listAssignmentRequests({ courseId: course.id }).filter(
        (r) => r.studentId === student.id && r.status === "scheduling_required",
      ).length,
    ).toBeGreaterThan(1);

    const healed = reconcileDuplicateOpenAssignmentRequests();
    expect(healed).toBeGreaterThanOrEqual(1);
    expect(
      listAssignmentRequests({ courseId: course.id }).filter(
        (r) => r.studentId === student.id && r.status === "scheduling_required",
      ),
    ).toHaveLength(1);

    await reassignInstructorEngine({
      courseId: course.id,
      instructorId: instructorB.id,
      studentId: student.id,
      actorId: cgi.id,
      moveFutureClasses: false,
    });
    const open = listAssignmentRequests({ courseId: course.id }).filter(
      (r) => r.studentId === student.id && r.status === "scheduling_required",
    );
    expect(open).toHaveLength(1);
    expect(open[0]?.instructorId).toBe(instructorB.id);
    expect(open[0]?.unableReason).toBe("No agreed time");
  });

  it("emails TKI 1 and Super Admin when the engine cannot place a slot", async () => {
    const instructor = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const superAdmin = findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find((c) => /^ATPL-/i.test(c.code) && !c.deletedAt)!;

    const assigned = await assignInstructorEngine({
      courseId: course.id,
      instructorId: instructor.id,
      studentId: student.id,
      actorId: cgi.id,
      scheduleNow: false,
    });
    expect(assigned.outcome).toBe("scheduling_required");

    writeAssignmentDb((db) => {
      db.settings.lookAheadDays = 0;
    });

    const beforeIds = new Set(listOutboundEmails(80).map((m) => m.id));
    const unable = await scheduleAssignmentSession({
      requestId: assigned.request.id,
      actorId: cgi.id,
    });
    expect(unable.outcome).toBe("unable_to_schedule");
    expect(unable.request.status).toBe("unable_to_schedule");

    const sent = newEmails(beforeIds);
    expect(sent.some((m) => m.to.toLowerCase() === cgi.email.toLowerCase())).toBe(true);
    expect(sent.some((m) => m.to.toLowerCase() === superAdmin.email.toLowerCase())).toBe(true);
  });
});
