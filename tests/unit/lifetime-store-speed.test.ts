/**
 * Lifetime data-layer speed: enrollments are indexed, catalog JSON stays slim,
 * and auth activity/audit logs cannot grow without bound.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AUTH_LOG_CAP } from "@/services/auth/store";
import {
  countDistinctStudents,
  countEnrollments,
  countEnrollmentsByCourse,
  getEnrollmentById,
  listEnrollmentsForCourse,
  listEnrollmentsForStudent,
  rebindEnrollmentsStudent,
  resetEnrollmentStoreRuntime,
  upsertEnrollment,
} from "@/lib/data/lms-enrollment-store";
import { getCourseStats } from "@/services/courses/course-service";
import { readCoursesDb, writeCoursesDb } from "@/services/courses/store";
import { getEnrollmentSeries } from "@/services/dashboard/metrics";
import {
  CLASS_REMINDER_DONE_CAP,
  listDueReminders,
  listRemindersForClass,
  resetClassReminderStoreRuntime,
  trimDoneReminders,
  upsertReminder,
} from "@/lib/data/lms-class-reminder-store";
import { writeClassesDb } from "@/services/classes/store";
import type { Enrollment } from "@/types/courses";
import type { ReminderQueueItem } from "@/types/classes";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testEnrollment(suffix: string): Enrollment {
  const now = new Date().toISOString();
  return {
    id: `enr-lifetime-speed-${suffix}`,
    courseId: `course-lifetime-speed-${suffix}`,
    studentId: `student-lifetime-speed-${suffix}`,
    status: "approved",
    enrolledById: null,
    enrolledAt: now,
    approvedAt: now,
    completedAt: null,
    droppedAt: null,
    suspendedAt: null,
    notes: "lifetime-store-speed test",
    updatedAt: now,
  };
}

describe("lifetime store speed contracts", () => {
  it("keeps student enrollment reads on the indexed helpers", () => {
    const enrollment = src("services/courses/enrollment-service.ts");
    expect(enrollment).toMatch(/listEnrollmentsForStudent\(/);
    expect(enrollment).toMatch(/listEnrollmentsForCourse\(/);
    expect(enrollment).toMatch(/upsertEnrollment\(/);
    expect(enrollment).toMatch(/getEnrollmentById\(/);

    const learning = src("services/learning/learning-service.ts");
    expect(learning).toMatch(/listStudentEnrollments\(/);
    expect(learning).not.toMatch(/readCoursesDb\(\)\.enrollments/);

    const access = src("services/learning/access.ts");
    expect(access).toMatch(/listStudentEnrollments\(/);

    expect(src("services/ai/context-service.ts")).toMatch(/listEnrollmentsForStudent\(/);
    expect(src("services/ai/recommendation-service.ts")).toMatch(/listEnrollmentsForStudent\(/);
    expect(src("services/courses/instructor-students.ts")).toMatch(/listEnrollmentsForCourse\(/);
    expect(src("services/courses/course-service.ts")).toMatch(/countEnrollments\(/);
    expect(src("services/courses/course-service.ts")).toMatch(/countDistinctStudents\(/);
    expect(src("services/dashboard/metrics.ts")).toMatch(/countEnrollmentsByCourse\(/);
    expect(src("services/analytics/aggregator.ts")).toMatch(/countEnrollmentsByCourse\(/);
    expect(src("services/analytics/aggregator.ts")).not.toMatch(/readCoursesDb\(\)\.enrollments/);
    expect(src("services/cgi/journey-service.ts")).toMatch(/rebindEnrollmentsStudent\(/);
    expect(src("services/cgi/journey-service.ts")).toMatch(/upsertEnrollment\(/);
    expect(src("services/cgi/journey-service.ts")).not.toMatch(/writeCoursesDb\(/);

    const reminders = src("services/classes/reminder-service.ts");
    expect(reminders).toMatch(/listDueReminders\(/);
    expect(reminders).toMatch(/replacePendingForClass\(/);
    expect(reminders).toMatch(/upsertReminder\(/);
    expect(reminders).not.toMatch(/writeClassesDb\(/);
    const classesStore = src("services/classes/store.ts");
    expect(classesStore).toMatch(/extractEmbeddedReminders/);
    expect(classesStore).toMatch(/withLazyReminderWrites/);
  });

  it("serves admin course stats and enrollment charts from aggregates", () => {
    const stats = getCourseStats();
    expect(stats.totalEnrollments).toBeGreaterThanOrEqual(0);
    expect(stats.activeStudents).toBeGreaterThanOrEqual(0);
    const series = getEnrollmentSeries();
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((point) => Number.isFinite(point.value))).toBe(true);
  });

  it("persists the course catalog without an enrollments blob", () => {
    const store = src("services/courses/store.ts");
    expect(store).toMatch(/enrollments: \[\]/);
    expect(store).toMatch(/extractEmbeddedEnrollments/);
    expect(store).toMatch(/withLazyEnrollmentWrites/);
    expect(store).toMatch(/flushEnrollments/);
  });

  it("bounds auth activity and audit history for the lifetime of the store", () => {
    expect(AUTH_LOG_CAP).toBe(400);
    const authStore = src("services/auth/store.ts");
    expect(authStore).toMatch(/export const AUTH_LOG_CAP = 400/);
    expect(authStore).toMatch(/activityLogs = parsed\.activityLogs\.slice\(0, AUTH_LOG_CAP\)/);
    expect(authStore).toMatch(/auditLogs = parsed\.auditLogs\.slice\(0, AUTH_LOG_CAP\)/);
    const activity = src("services/auth/activity-log.ts");
    expect(activity).toMatch(/AUTH_LOG_CAP/);
    expect(activity).not.toMatch(/slice\(0,\s*5000\)/);
  });

  it("declares the indexed SQL table for production", () => {
    const migration = src("database/migrations/035_lms_enrollment_store.sql");
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_enrollments/);
    expect(migration).toMatch(/aep_lms_enrollments_student_idx/);
    expect(migration).toMatch(/aep_lms_enrollments_course_idx/);
    const runtime = src("lib/data/lms-enrollment-store.ts");
    expect(runtime).toMatch(/CREATE TABLE IF NOT EXISTS \$\{TABLE\}/);
    expect(runtime).toMatch(/WHERE student_id = \$1/);
    expect(runtime).toMatch(/WHERE course_id = \$1/);
    expect(runtime).toContain('const TABLE = "aep_lms_enrollments"');
    expect(runtime).toMatch(/function ensureFileIndex\(/);
    expect(runtime).toMatch(/COUNT\(\*\)::int AS n FROM \$\{TABLE\}/);
    expect(runtime).toMatch(/GROUP BY course_id/);
    expect(runtime).toMatch(/COUNT\(DISTINCT student_id\)/);
    const reminderMigration = src("database/migrations/036_lms_class_reminder_store.sql");
    expect(reminderMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_class_reminders/);
    const reminderRuntime = src("lib/data/lms-class-reminder-store.ts");
    expect(reminderRuntime).toContain('const TABLE = "aep_lms_class_reminders"');
    expect(reminderRuntime).toMatch(/CLASS_REMINDER_DONE_CAP = 400/);
    expect(reminderRuntime).toMatch(/status = 'pending' AND scheduled_for <= \$1/);
  });
});

describe("indexed enrollment store", () => {
  const createdIds: string[] = [];

  afterEach(() => {
    if (createdIds.length === 0) return;
    writeCoursesDb((db) => {
      db.enrollments = db.enrollments.filter((row) => !createdIds.includes(row.id));
    });
    createdIds.length = 0;
    resetEnrollmentStoreRuntime();
  });

  it("returns one student without scanning every enrollment", () => {
    const first = testEnrollment("alpha");
    const second = testEnrollment("beta");
    upsertEnrollment(first);
    upsertEnrollment(second);
    createdIds.push(first.id, second.id);
    resetEnrollmentStoreRuntime();

    expect(listEnrollmentsForStudent(first.studentId)).toEqual([
      expect.objectContaining({ id: first.id, courseId: first.courseId }),
    ]);
    expect(listEnrollmentsForCourse(second.courseId)).toEqual([
      expect.objectContaining({ id: second.id, studentId: second.studentId }),
    ]);
    expect(getEnrollmentById(first.id)?.studentId).toBe(first.studentId);
  });

  it("keeps catalog writes from wiping enrollments when they are not touched", () => {
    const row = testEnrollment("catalog-write");
    upsertEnrollment(row);
    createdIds.push(row.id);

    writeCoursesDb((db) => {
      db.seeded = db.seeded;
    });

    expect(getEnrollmentById(row.id)?.id).toBe(row.id);
    expect(listEnrollmentsForStudent(row.studentId)).toHaveLength(1);

    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-courses.json"), "utf8"),
    ) as { enrollments?: unknown[] };
    expect(catalog.enrollments ?? []).toEqual([]);
  });

  it("extracts enrollments written through the courses database view", () => {
    const row = testEnrollment("extract");
    createdIds.push(row.id);
    writeCoursesDb((db) => {
      db.enrollments.push(row);
    });
    resetEnrollmentStoreRuntime();

    expect(getEnrollmentById(row.id)?.courseId).toBe(row.courseId);
    expect(readCoursesDb().enrollments.some((item) => item.id === row.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-courses.json"), "utf8"),
    ) as { enrollments?: unknown[] };
    expect(catalog.enrollments ?? []).toEqual([]);
  });

  it("aggregates and rebinds without listing every enrollment", () => {
    const approved = testEnrollment("agg-approved");
    const pending = testEnrollment("agg-pending");
    pending.status = "pending";
    pending.courseId = approved.courseId;
    pending.studentId = "student-lifetime-speed-agg-other";
    upsertEnrollment(approved);
    upsertEnrollment(pending);
    createdIds.push(approved.id, pending.id);
    resetEnrollmentStoreRuntime();

    expect(countEnrollments({ courseId: approved.courseId })).toBe(2);
    expect(countEnrollments({ courseId: approved.courseId, statuses: ["approved"] })).toBe(1);
    expect(countDistinctStudents({ courseId: approved.courseId })).toBe(2);
    expect(
      countEnrollmentsByCourse({ courseId: approved.courseId }).find(
        (row) => row.courseId === approved.courseId,
      )?.count,
    ).toBe(2);

    const fromStudentId = approved.studentId;
    expect(rebindEnrollmentsStudent(fromStudentId, "student-lifetime-speed-agg-rebound")).toBe(1);
    expect(listEnrollmentsForStudent(fromStudentId)).toEqual([]);
    expect(listEnrollmentsForStudent("student-lifetime-speed-agg-rebound")).toEqual([
      expect.objectContaining({ id: approved.id, courseId: approved.courseId }),
    ]);
  });
});

function testReminder(
  suffix: string,
  status: ReminderQueueItem["status"] = "pending",
): ReminderQueueItem {
  const now = new Date().toISOString();
  return {
    id: `rem-lifetime-speed-${suffix}`,
    liveClassId: `cls-lifetime-speed-${suffix}`,
    userId: `user-lifetime-speed-${suffix}`,
    kind: "15m",
    channel: "in_app",
    scheduledFor: now,
    sentAt: status === "sent" ? now : null,
    status,
    payload: { title: "lifetime reminder" },
    createdAt: now,
  };
}

describe("indexed class reminder store", () => {
  afterEach(() => {
    resetClassReminderStoreRuntime();
  });

  it("returns due reminders for one class without scanning the catalog blob", () => {
    const due = testReminder("due");
    due.scheduledFor = new Date(Date.now() - 60_000).toISOString();
    const later = testReminder("later");
    later.scheduledFor = new Date(Date.now() + 60 * 60_000).toISOString();
    upsertReminder(due);
    upsertReminder(later);

    expect(listRemindersForClass(due.liveClassId)).toEqual([
      expect.objectContaining({ id: due.id }),
    ]);
    expect(listDueReminders().map((row) => row.id)).toContain(due.id);
    expect(listDueReminders().map((row) => row.id)).not.toContain(later.id);
  });

  it("caps finished reminder history so the queue cannot grow forever", () => {
    const pending = testReminder("keep-pending");
    const done = Array.from({ length: CLASS_REMINDER_DONE_CAP + 25 }, (_, index) => {
      const row = testReminder(`done-${index}`, "sent");
      row.scheduledFor = new Date(Date.now() - index * 1000).toISOString();
      return row;
    });
    const trimmed = trimDoneReminders([pending, ...done]);
    expect(trimmed.filter((row) => row.status === "pending")).toHaveLength(1);
    expect(trimmed.filter((row) => row.status === "sent")).toHaveLength(CLASS_REMINDER_DONE_CAP);
  });

  it("extracts reminders written through the classes database view", () => {
    const row = testReminder("extract");
    writeClassesDb((db) => {
      db.reminders.push(row);
    });
    resetClassReminderStoreRuntime();
    expect(listRemindersForClass(row.liveClassId).some((item) => item.id === row.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-classes.json"), "utf8"),
    ) as { reminders?: unknown[] };
    expect(catalog.reminders ?? []).toEqual([]);
  });
});
