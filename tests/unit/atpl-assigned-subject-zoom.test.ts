/**
 * After TKI 1 assigns/approves a subject, Zoom must open on that subject.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ATPL_PACKAGE_OPENING_SUBJECT_TITLE } from "@/constants/atpl-complete-package";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { getLiveClass } from "@/services/classes/class-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import {
  chooseFirstSubject,
  distributeLecture,
  distributeSubjects,
  ensureStudentSubjectPlan,
  listAtplCourses,
} from "@/services/cgi/journey-service";
import { resetCgiDbCache, writeCgiDb } from "@/services/cgi/store";
import { listNotifications } from "@/services/notifications/notification-service";

describe("ATPL assigned subject opens the matching Zoom classroom", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensureClassesSeeded();
    resetCgiDbCache();
    writeCgiDb((db) => {
      db.subjectAssignments = [];
      db.lectureAssignments = [];
      db.notes = [];
      db.audit = [];
    });
  });

  it("still opens Zoom on the assigned subject even when Instrumentation stays first", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const subjects = listAtplCourses();
    const selected =
      subjects.find((subject) => subject.title !== ATPL_PACKAGE_OPENING_SUBJECT_TITLE) ??
      subjects[1]!;

    distributeSubjects({
      studentId: student.id,
      courseIds: subjects.map((subject) => subject.id),
      firstCourseId: selected.id,
      actorId: cgi.id,
    });
    ensureStudentSubjectPlan(student.id, cgi.id);

    const lecture = await distributeLecture({
      courseId: selected.id,
      lessonId: `lesson-assigned-${Date.now()}`,
      lessonTitle: selected.title,
      instructorId: instructor.id,
      studentId: student.id,
      actorId: cgi.id,
    });

    expect(lecture.courseId).toBe(selected.id);
    expect(getLiveClass(lecture.liveClassId!)?.courseId).toBe(selected.id);
    expect(getLiveClass(lecture.liveClassId!)?.title).toContain(selected.title);
  }, 60_000);

  it("creates a Zoom classroom on the subject TKI 1 assigned", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const subjects = listAtplCourses();
    const selected =
      subjects.find((subject) => subject.title !== ATPL_PACKAGE_OPENING_SUBJECT_TITLE) ??
      subjects[1]!;

    await chooseFirstSubject({
      studentId: student.id,
      courseId: selected.id,
      actorId: cgi.id,
    });

    const lecture = await distributeLecture({
      courseId: selected.id,
      lessonId: `lesson-selected-${Date.now()}`,
      lessonTitle: selected.title,
      instructorId: instructor.id,
      studentId: student.id,
      actorId: cgi.id,
    });

    expect(lecture.courseId).toBe(selected.id);
    expect(lecture.liveClassId).toBeTruthy();
    const live = getLiveClass(lecture.liveClassId!);
    expect(live?.courseId).toBe(selected.id);
    expect(live?.title).toContain(selected.title);
    expect(
      listNotifications(student.id).data.some(
        (row) =>
          row.type === "student.instructor_assigned" &&
          row.actionUrl === `/join/${lecture.liveClassId}` &&
          row.body.includes(selected.title),
      ),
    ).toBe(true);
    expect(
      listNotifications(instructor.id).data.some(
        (row) =>
          row.type === "instructor.student_assigned" &&
          row.actionUrl === `/join/${lecture.liveClassId}`,
      ),
    ).toBe(true);
  }, 60_000);

  it("opens Instrumentation Zoom when that is the assigned first subject", async () => {
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const cgi = findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)!;
    const instrumentation =
      listAtplCourses().find((subject) => subject.title === ATPL_PACKAGE_OPENING_SUBJECT_TITLE) ??
      listAtplCourses()[0]!;

    const lecture = await distributeLecture({
      courseId: instrumentation.id,
      lessonId: `lesson-instrumentation-${Date.now()}`,
      lessonTitle: "Instrumentation",
      instructorId: instructor.id,
      studentId: student.id,
      actorId: cgi.id,
    });

    const live = getLiveClass(lecture.liveClassId!);
    expect(live?.courseId).toBe(instrumentation.id);
    expect(live?.title).toMatch(/Instrumentation/);
    expect(lecture.liveClassId).toBeTruthy();
  }, 60_000);
});
