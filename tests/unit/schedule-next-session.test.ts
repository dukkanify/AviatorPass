/**
 * Official ATPL journey: Schedule Next Session emails the student
 * date, time, join URL, and subject name.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ATPL_PACKAGE_LECTURE_TITLE } from "@/constants/atpl-complete-package";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import {
  listAssignmentRequests,
  reportUnableToScheduleNextLecture,
  scheduleNextLectureFromClass,
} from "@/services/assignment/engine";
import { resetAssignmentDbCache, writeAssignmentDb } from "@/services/assignment/store";
import { createLiveClass, getLiveClass } from "@/services/classes/class-service";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { writeClassesDb } from "@/services/classes/store";
import { completeSubjectFromClass } from "@/services/cgi/journey-service";
import { readCgiDb, writeCgiDb } from "@/services/cgi/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb } from "@/services/courses/store";

function uniqueSlot(offsetHours: number) {
  const start = new Date(Date.now() + 140 * 86_400_000 + offsetHours * 3_600_000);
  start.setUTCMinutes(0, 0, 0);
  const ends = new Date(start.getTime() + 60 * 60_000);
  return { start, ends };
}

function futureDateTime(offsetDays: number, hour: number) {
  const when = new Date(Date.now() + offsetDays * 86_400_000);
  when.setHours(hour, 0, 0, 0);
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:00`,
    when,
  };
}

describe("schedule next session", () => {
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

  it("does not open the same ATPL subject again", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find((c) => c.code === "ATPL-022" && !c.deletedAt)!;
    const { start, ends } = uniqueSlot(3);
    const next = futureDateTime(150, 18);

    const live = await createLiveClass({
      title: `${ATPL_PACKAGE_LECTURE_TITLE} · Instrumentation`,
      instructorId: instructor.id,
      courseId: course.id,
      startsAt: start.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      status: "scheduled",
      enrollStudentIds: [student.id],
      actorId: instructor.id,
    });

    await expect(
      scheduleNextLectureFromClass({
        liveClassId: live!.id,
        studentId: student.id,
        studyStartDate: next.date,
        lectureTime: next.time,
        actorId: instructor.id,
      }),
    ).rejects.toThrow(/does not open again/);
    expect(getLiveClass(live!.id)?.status).toBe("scheduled");
  });

  it("lets the assigned instructor mark the open subject complete", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find((c) => c.code === "ATPL-022" && !c.deletedAt)!;
    const { start, ends } = uniqueSlot(4);
    const previous = readCgiDb()
      .subjectAssignments.filter((row) => row.studentId === student.id)
      .map((row) => ({ ...row }));
    writeCgiDb((db) => {
      db.subjectAssignments = db.subjectAssignments.filter((row) => row.studentId !== student.id);
    });

    try {
      const live = await createLiveClass({
        title: `${ATPL_PACKAGE_LECTURE_TITLE} · Instrumentation`,
        instructorId: instructor.id,
        courseId: course.id,
        startsAt: start.toISOString(),
        endsAt: ends.toISOString(),
        durationMinutes: 60,
        status: "scheduled",
        enrollStudentIds: [student.id],
        actorId: instructor.id,
      });

      const result = await completeSubjectFromClass({
        liveClassId: live!.id,
        studentId: student.id,
        actorId: instructor.id,
      });
      expect(result.subjectTitle).toBe("Instrumentation");
      expect(getLiveClass(live!.id)?.status).toBe("completed");
      expect(
        readCgiDb().subjectAssignments.find(
          (row) => row.studentId === student.id && row.courseId === course.id,
        )?.status,
      ).toBe("completed");
    } finally {
      writeCgiDb((db) => {
        db.subjectAssignments = [
          ...db.subjectAssignments.filter((row) => row.studentId !== student.id),
          ...previous,
        ];
      });
    }
  });

  it("clears Scheduling Required when the instructor later books the next session", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find(
      (c) => c.code && !/^ATPL-/i.test(c.code) && !c.deletedAt,
    )!;
    const { start, ends } = uniqueSlot(5);
    const next = futureDateTime(152, 16);

    writeClassesDb((d) => {
      for (const c of d.classes) {
        if (c.instructorId !== instructor.id) continue;
        if (Date.parse(c.startsAt) < Date.now() + 100 * 86_400_000) continue;
        c.status = "cancelled";
        c.cancelledAt = new Date().toISOString();
      }
    });

    const live = await createLiveClass({
      title: `${ATPL_PACKAGE_LECTURE_TITLE} · Meteorology`,
      instructorId: instructor.id,
      courseId: course.id,
      startsAt: start.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      status: "completed",
      enrollStudentIds: [student.id],
      actorId: instructor.id,
    });

    const unable = await reportUnableToScheduleNextLecture({
      liveClassId: live!.id,
      studentId: student.id,
      reason: "No matching slot this week",
      actorId: instructor.id,
    });
    expect(unable.request.status).toBe("scheduling_required");

    const booked = await scheduleNextLectureFromClass({
      liveClassId: live!.id,
      studentId: student.id,
      studyStartDate: next.date,
      lectureTime: next.time,
      actorId: instructor.id,
    });
    expect(booked.request.id).toBe(unable.request.id);
    expect(booked.request.status).toBe("scheduled");
    expect(booked.subjectName).toBe("Meteorology");
    expect(
      listAssignmentRequests({ courseId: course.id }).some(
        (r) => r.id === unable.request.id && r.status === "scheduling_required",
      ),
    ).toBe(false);
  });

  it("rejects a next lecture in the past", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const course = readCoursesDb().courses.find(
      (c) => c.code && !/^ATPL-/i.test(c.code) && !c.deletedAt,
    )!;
    const { start, ends } = uniqueSlot(7);

    const live = await createLiveClass({
      title: `${ATPL_PACKAGE_LECTURE_TITLE} · Air Law`,
      instructorId: instructor.id,
      courseId: course.id,
      startsAt: start.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: 60,
      status: "completed",
      enrollStudentIds: [student.id],
      actorId: instructor.id,
    });

    await expect(
      scheduleNextLectureFromClass({
        liveClassId: live!.id,
        studentId: student.id,
        studyStartDate: "2020-01-01",
        lectureTime: "10:00",
        actorId: instructor.id,
      }),
    ).rejects.toThrow(/future/i);
  });
});
