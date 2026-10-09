/**
 * Lifetime data-layer speed: enrollments are indexed, catalog JSON stays slim,
 * and auth activity/audit logs cannot grow without bound.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AUTH_LOG_CAP, writeAuthDb, type StoredUser } from "@/services/auth/store";
import {
  AUTH_NOTIFICATION_CAP,
  countUnreadForUser,
  listAllNotifications,
  listNotificationsForUser,
  replaceAllNotifications,
  resetNotificationStoreRuntime,
  trimNotifications,
  upsertNotification,
} from "@/lib/data/auth-notification-store";
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
import {
  hasParticipant,
  listParticipantsForClass,
  listParticipantsForUser,
  resetClassParticipantStoreRuntime,
  upsertParticipant,
} from "@/lib/data/lms-class-participant-store";
import { writeClassesDb } from "@/services/classes/store";
import {
  countOrders,
  getInvoiceById,
  getOrderById,
  getPaymentById,
  listAllInvoices,
  listAllOrders,
  listAllPayments,
  listInvoicesForStudent,
  listOrdersForEmail,
  listOrdersForStudent,
  listPaymentsForOrder,
  replaceAllInvoices,
  replaceAllOrders,
  replaceAllPayments,
  resetPaymentLedgerStoreRuntime,
  upsertInvoice,
  upsertOrder,
  upsertPayment,
} from "@/lib/data/lms-payment-ledger-store";
import { writePaymentsDb } from "@/services/payments/store";
import {
  getInstallmentPlanById,
  listAllInstallmentPlans,
  listAllInstallmentSchedule,
  listInstallmentPlansForStudent,
  listScheduleForPlan,
  replaceAllInstallmentPlans,
  replaceAllInstallmentSchedule,
  resetInstallmentStoreRuntime,
  upsertInstallmentPlan,
  upsertScheduleItem,
} from "@/lib/data/lms-installment-store";
import {
  listAllTransactionLogs,
  listAllWalletTransactions,
  listRecentTransactionLogs,
  listWalletTransactionsForInstructor,
  PAYMENT_LOG_CAP,
  replaceAllTransactionLogs,
  replaceAllWalletTransactions,
  resetPaymentActivityStoreRuntime,
  trimTransactionLogs,
  upsertWalletTransaction,
} from "@/lib/data/lms-payment-activity-store";
import type {
  InstallmentPlan,
  InstallmentScheduleItem,
  Invoice,
  Order,
  PaymentRecord,
  TransactionLog,
  WalletTransaction,
} from "@/types/payments";
import type { Enrollment } from "@/types/courses";
import type { MeetingParticipant, ReminderQueueItem } from "@/types/classes";
import {
  getSessionById,
  getUserByEmail,
  getUserById,
  listAllSessions,
  listAllUsers,
  replaceAllSessions,
  replaceAllUsers,
  resetAuthIdentityStoreRuntime,
  upsertSession,
  upsertUser,
} from "@/lib/data/auth-identity-store";
import type { NotificationRecord, SessionRecord } from "@/types";

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
    expect(classesStore).toMatch(/extractEmbeddedParticipants/);
    expect(src("services/classes/calendar-service.ts")).toMatch(/listParticipantsForUser\(/);
    expect(src("services/classes/class-service.ts")).toMatch(/listParticipantsForClass\(/);
    expect(src("services/learning/learning-service.ts")).toMatch(/listParticipantsForUser\(/);
    expect(src("services/cgi/journey-service.ts")).toMatch(/hasParticipant\(/);
    expect(classesStore).toMatch(/withLazyIndexedWrites/);

    const notifications = src("services/notifications/notification-service.ts");
    expect(notifications).toMatch(/listNotificationsForUser\(/);
    expect(notifications).toMatch(/countUnreadForUser\(/);
    expect(notifications).toMatch(/upsertNotification\(/);
    expect(notifications).not.toMatch(/readAuthDb\(\)\.notifications/);
    expect(src("services/analytics/aggregator.ts")).toMatch(/countUnreadNotifications\(/);
    expect(src("services/analytics/aggregator.ts")).not.toMatch(/readAuthDb\(\)\.notifications/);
    expect(src("services/demo/reset-demo-environment.ts")).toMatch(/listNotificationsForUser\(/);
    const authStore = src("services/auth/store.ts");
    expect(authStore).toMatch(/extractEmbeddedNotifications/);
    expect(authStore).toMatch(/extractEmbeddedIdentity/);
    expect(authStore).toMatch(/withLazyNotificationWrites/);
    expect(authStore).toMatch(/notifications: \[\]/);
    expect(authStore).toMatch(/users: \[\]/);
    expect(authStore).toMatch(/sessions: \[\]/);
    expect(src("services/auth/store.ts")).toMatch(/getUserById\(/);
    expect(src("services/auth/store.ts")).toMatch(/getUserByEmail\(/);
    expect(src("services/auth/auth-service.ts")).toMatch(/getSessionById\(/);
    expect(src("services/auth/auth-service.ts")).not.toMatch(/readAuthDb\(\)\.sessions/);

    const checkout = src("services/payments/checkout-service.ts");
    expect(checkout).toMatch(/listOrdersForStudent\(/);
    expect(checkout).toMatch(/countOrders\(/);
    expect(checkout).toMatch(/getOrderById\(/);
    expect(checkout).not.toMatch(/readPaymentsDb\(\)\.orders/);
    expect(src("services/payments/invoice-service.ts")).toMatch(/listInvoicesForStudent\(/);
    expect(src("services/payments/invoice-service.ts")).toMatch(/countInvoices\(/);
    expect(src("services/payments/purchase-first-service.ts")).toMatch(/listOrdersForStudent\(/);
    expect(src("services/cgi/journey-service.ts")).toMatch(/listOrdersForStudent\(/);
    expect(src("services/cgi/journey-service.ts")).toMatch(/listOrdersForEmail\(/);
    const paymentsStore = src("services/payments/store.ts");
    expect(paymentsStore).toMatch(/extractEmbeddedLedger/);
    expect(paymentsStore).toMatch(/extractEmbeddedInstallments/);
    expect(paymentsStore).toMatch(/extractEmbeddedActivity/);
    expect(paymentsStore).toMatch(/withLazyLedgerWrites/);
    expect(paymentsStore).toMatch(/orders: \[\]/);
    expect(paymentsStore).toMatch(/walletTransactions: \[\]/);
    expect(paymentsStore).toMatch(/transactionLogs: \[\]/);
    expect(src("services/payments/wallet-service.ts")).toMatch(
      /listWalletTransactionsForInstructor\(/,
    );
    expect(src("services/payments/wallet-service.ts")).not.toMatch(
      /readPaymentsDb\(\)\.walletTransactions/,
    );
    expect(src("services/payments/checkout-service.ts")).toMatch(/listRecentTransactionLogs\(/);
    expect(src("services/payments/checkout-service.ts")).not.toMatch(
      /readPaymentsDb\(\)\.transactionLogs/,
    );
    const installments = src("services/payments/installment-service.ts");
    expect(installments).toMatch(/listInstallmentPlansForStudent\(/);
    expect(installments).toMatch(/getInstallmentPlanById\(/);
    expect(installments).not.toMatch(/readPaymentsDb\(\)\.installmentPlans/);
    expect(src("services/payments/installment-reminder-service.ts")).toMatch(
      /listInstallmentPlansByStatus\(/,
    );
    expect(src("services/payments/installment-reminder-service.ts")).toMatch(
      /listScheduleForPlan\(/,
    );
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
    const participantMigration = src("database/migrations/037_lms_class_participant_store.sql");
    expect(participantMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_class_participants/);
    const participantRuntime = src("lib/data/lms-class-participant-store.ts");
    expect(participantRuntime).toContain('const TABLE = "aep_lms_class_participants"');
    expect(participantRuntime).toMatch(/WHERE live_class_id = \$1/);
    expect(participantRuntime).toMatch(/WHERE user_id = \$1/);
    const notificationMigration = src("database/migrations/038_auth_notification_store.sql");
    expect(notificationMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_auth_notifications/);
    const notificationRuntime = src("lib/data/auth-notification-store.ts");
    expect(notificationRuntime).toContain('const TABLE = "aep_auth_notifications"');
    expect(notificationRuntime).toMatch(/AUTH_NOTIFICATION_CAP = 400/);
    expect(notificationRuntime).toMatch(/WHERE user_id = \$1/);
    expect(notificationRuntime).toMatch(/WHERE user_id = \$1 AND status = 'unread'/);
    const ledgerMigration = src("database/migrations/039_lms_payment_ledger_store.sql");
    expect(ledgerMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_payment_orders/);
    expect(ledgerMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_payment_invoices/);
    expect(ledgerMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_payment_records/);
    const ledgerRuntime = src("lib/data/lms-payment-ledger-store.ts");
    expect(ledgerRuntime).toContain('const ORDER_TABLE = "aep_lms_payment_orders"');
    expect(ledgerRuntime).toMatch(/WHERE student_id = \$1/);
    expect(ledgerRuntime).toMatch(/WHERE student_email = \$1 OR billing_email = \$1/);
    expect(ledgerRuntime).toMatch(/WHERE order_id = \$1/);
    const installmentMigration = src("database/migrations/040_lms_installment_store.sql");
    expect(installmentMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_installment_plans/);
    expect(installmentMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_installment_schedule/);
    const installmentRuntime = src("lib/data/lms-installment-store.ts");
    expect(installmentRuntime).toContain('const PLAN_TABLE = "aep_lms_installment_plans"');
    expect(installmentRuntime).toMatch(/WHERE student_id = \$1/);
    expect(installmentRuntime).toMatch(/WHERE plan_id = \$1/);
    const activityMigration = src("database/migrations/041_lms_payment_activity_store.sql");
    expect(activityMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_wallet_transactions/);
    expect(activityMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_lms_transaction_logs/);
    const activityRuntime = src("lib/data/lms-payment-activity-store.ts");
    expect(activityRuntime).toContain('const WALLET_TABLE = "aep_lms_wallet_transactions"');
    expect(activityRuntime).toContain('const LOG_TABLE = "aep_lms_transaction_logs"');
    expect(activityRuntime).toMatch(/PAYMENT_LOG_CAP = 400/);
    expect(activityRuntime).toMatch(/WHERE instructor_id = \$1/);
    expect(activityRuntime).toMatch(/ORDER BY created_at DESC, id DESC LIMIT \$1/);
    const identityMigration = src("database/migrations/042_auth_identity_store.sql");
    expect(identityMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_auth_users/);
    expect(identityMigration).toMatch(/CREATE TABLE IF NOT EXISTS aep_auth_sessions/);
    const identityRuntime = src("lib/data/auth-identity-store.ts");
    expect(identityRuntime).toContain('const USER_TABLE = "aep_auth_users"');
    expect(identityRuntime).toContain('const SESSION_TABLE = "aep_auth_sessions"');
    expect(identityRuntime).toMatch(/WHERE id = \$1/);
    expect(identityRuntime).toMatch(/WHERE email = \$1/);
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

function testParticipant(suffix: string): MeetingParticipant {
  return {
    id: `part-lifetime-speed-${suffix}`,
    liveClassId: `cls-lifetime-speed-${suffix}`,
    userId: `user-lifetime-speed-${suffix}`,
    role: "participant",
    invitedAt: new Date().toISOString(),
    joinedAt: null,
  };
}

describe("indexed class participant store", () => {
  afterEach(() => {
    resetClassParticipantStoreRuntime();
  });

  it("returns one student or class without scanning every invite", () => {
    const first = testParticipant("alpha");
    const second = testParticipant("beta");
    upsertParticipant(first);
    upsertParticipant(second);
    resetClassParticipantStoreRuntime();

    expect(listParticipantsForUser(first.userId)).toEqual([
      expect.objectContaining({ id: first.id, liveClassId: first.liveClassId }),
    ]);
    expect(listParticipantsForClass(second.liveClassId)).toEqual([
      expect.objectContaining({ id: second.id, userId: second.userId }),
    ]);
    expect(hasParticipant(first.liveClassId, first.userId, "participant")).toBe(true);
    expect(hasParticipant(first.liveClassId, second.userId)).toBe(false);
  });

  it("extracts participants written through the classes database view", () => {
    const row = testParticipant("extract");
    writeClassesDb((db) => {
      db.participants.push(row);
    });
    resetClassParticipantStoreRuntime();
    expect(listParticipantsForClass(row.liveClassId).some((item) => item.id === row.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-classes.json"), "utf8"),
    ) as { participants?: unknown[] };
    expect(catalog.participants ?? []).toEqual([]);
  });
});

function testNotification(suffix: string, read = false): NotificationRecord {
  const now = new Date().toISOString();
  return {
    id: `note-lifetime-speed-${suffix}`,
    userId: `user-lifetime-speed-${suffix}`,
    title: "Lifetime inbox",
    body: "Indexed notification",
    channel: "in_app",
    type: "system",
    status: read ? "read" : "unread",
    data: {},
    readAt: read ? now : null,
    createdAt: now,
  };
}

describe("indexed auth notification store", () => {
  afterEach(() => {
    const kept = listAllNotifications().filter((row) => !row.id.startsWith("note-lifetime-speed-"));
    replaceAllNotifications(kept);
    resetNotificationStoreRuntime();
  });

  it("returns one student inbox without scanning every notification", () => {
    const first = testNotification("alpha");
    const second = testNotification("beta");
    upsertNotification(first);
    upsertNotification(second);
    resetNotificationStoreRuntime();

    expect(listNotificationsForUser(first.userId)).toEqual([
      expect.objectContaining({ id: first.id, userId: first.userId }),
    ]);
    expect(countUnreadForUser(first.userId)).toBe(1);
    expect(countUnreadForUser(second.userId)).toBe(1);
    expect(listNotificationsForUser("missing-user")).toEqual([]);
  });

  it("caps read history per user and never drops unread rows", () => {
    const unread = testNotification("keep-unread");
    const read = Array.from({ length: AUTH_NOTIFICATION_CAP + 25 }, (_, index) => {
      const row = testNotification(`read-${index}`, true);
      row.userId = unread.userId;
      row.createdAt = new Date(Date.now() - index * 1000).toISOString();
      return row;
    });
    const trimmed = trimNotifications([unread, ...read]);
    expect(trimmed.filter((row) => !row.readAt)).toHaveLength(1);
    expect(trimmed.filter((row) => row.readAt)).toHaveLength(AUTH_NOTIFICATION_CAP - 1);
  });

  it("extracts notifications written through the auth database view", () => {
    const row = testNotification("extract");
    writeAuthDb((db) => {
      db.notifications.push(row);
    });
    resetNotificationStoreRuntime();
    expect(listNotificationsForUser(row.userId).some((item) => item.id === row.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-auth.json"), "utf8"),
    ) as { notifications?: unknown[] };
    expect(catalog.notifications ?? []).toEqual([]);
  });
});

function testOrder(suffix: string): Order {
  const now = new Date().toISOString();
  return {
    id: `ord-lifetime-speed-${suffix}`,
    orderNumber: `ORD-2099-${suffix}`,
    studentId: `student-lifetime-speed-${suffix}`,
    studentName: "Lifetime Student",
    studentEmail: `${suffix}@lifetime.test`,
    status: "paid",
    currency: "KWD",
    subtotalAmount: 1000,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: 1000,
    couponId: null,
    couponCode: null,
    billingName: "Lifetime Student",
    billingEmail: `${suffix}@lifetime.test`,
    billingCountry: "KW",
    billingAddress: "",
    items: [],
    paymentId: `pay-lifetime-speed-${suffix}`,
    invoiceId: `inv-lifetime-speed-${suffix}`,
    idempotencyKey: `idem-lifetime-speed-${suffix}`,
    failureReason: null,
    paidAt: now,
    cancelledAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function testInvoice(suffix: string): Invoice {
  const now = new Date().toISOString();
  return {
    id: `inv-lifetime-speed-${suffix}`,
    invoiceNumber: `INV-2099-${suffix}`,
    orderId: `ord-lifetime-speed-${suffix}`,
    paymentId: `pay-lifetime-speed-${suffix}`,
    studentId: `student-lifetime-speed-${suffix}`,
    studentName: "Lifetime Student",
    studentEmail: `${suffix}@lifetime.test`,
    status: "paid",
    currency: "KWD",
    subtotalAmount: 1000,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 1000,
    paymentMethodSummary: "card",
    items: [],
    issuedAt: now,
    paidAt: now,
    pdfReady: true,
    emailedAt: now,
    metadata: { paymentId: `pay-lifetime-speed-${suffix}` },
    createdAt: now,
    updatedAt: now,
  };
}

function testPayment(suffix: string): PaymentRecord {
  const now = new Date().toISOString();
  return {
    id: `pay-lifetime-speed-${suffix}`,
    orderId: `ord-lifetime-speed-${suffix}`,
    provider: "mock",
    providerPaymentId: `prov-lifetime-speed-${suffix}`,
    status: "succeeded",
    methodBrand: "card",
    paymentMethodSummary: "card",
    amount: 1000,
    currency: "KWD",
    clientSecret: null,
    checkoutUrl: null,
    stripeCustomerId: null,
    checkoutSessionId: `cs-lifetime-speed-${suffix}`,
    paymentIntentId: null,
    stripeInvoiceId: null,
    receiptUrl: null,
    stripeFeeMinor: null,
    netAmountMinor: null,
    country: "KW",
    billingAddressSnapshot: null,
    webhookVerified: true,
    failureCode: null,
    failureMessage: null,
    rawProviderPayload: {},
    studentId: `student-lifetime-speed-${suffix}`,
    courseId: null,
    stripeEventId: null,
    invoiceNumber: `INV-2099-${suffix}`,
    createdAt: now,
    updatedAt: now,
  };
}

describe("indexed payment ledger", () => {
  afterEach(() => {
    replaceAllOrders(listAllOrders().filter((row) => !row.id.startsWith("ord-lifetime-speed-")));
    replaceAllInvoices(
      listAllInvoices().filter((row) => !row.id.startsWith("inv-lifetime-speed-")),
    );
    replaceAllPayments(
      listAllPayments().filter((row) => !row.id.startsWith("pay-lifetime-speed-")),
    );
    resetPaymentLedgerStoreRuntime();
  });

  it("returns one student ledger without scanning every order", () => {
    const first = testOrder("alpha");
    const second = testOrder("beta");
    upsertOrder(first);
    upsertOrder(second);
    upsertInvoice(testInvoice("alpha"));
    upsertPayment(testPayment("alpha"));
    resetPaymentLedgerStoreRuntime();

    expect(listOrdersForStudent(first.studentId)).toEqual([
      expect.objectContaining({ id: first.id, studentId: first.studentId }),
    ]);
    expect(listOrdersForEmail(first.studentEmail)).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
    expect(getOrderById(first.id)?.studentEmail).toBe(first.studentEmail);
    expect(listInvoicesForStudent(first.studentId)).toEqual([
      expect.objectContaining({ id: `inv-lifetime-speed-alpha` }),
    ]);
    expect(getInvoiceById(`inv-lifetime-speed-alpha`)?.orderId).toBe(first.id);
    expect(listPaymentsForOrder(first.id)).toEqual([
      expect.objectContaining({ id: `pay-lifetime-speed-alpha` }),
    ]);
    expect(getPaymentById(`pay-lifetime-speed-alpha`)?.orderId).toBe(first.id);
    expect(countOrders()).toBeGreaterThanOrEqual(2);
  });

  it("extracts ledger rows written through the payments catalog view", () => {
    const order = testOrder("extract");
    const invoice = testInvoice("extract");
    const payment = testPayment("extract");
    writePaymentsDb((db) => {
      db.orders.push(order);
      db.invoices.push(invoice);
      db.payments.push(payment);
    });
    resetPaymentLedgerStoreRuntime();
    expect(getOrderById(order.id)?.studentId).toBe(order.studentId);
    expect(listInvoicesForStudent(order.studentId).some((row) => row.id === invoice.id)).toBe(true);
    expect(listPaymentsForOrder(order.id).some((row) => row.id === payment.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-payments.json"), "utf8"),
    ) as { orders?: unknown[]; invoices?: unknown[]; payments?: unknown[] };
    expect(catalog.orders ?? []).toEqual([]);
    expect(catalog.invoices ?? []).toEqual([]);
    expect(catalog.payments ?? []).toEqual([]);
  });
});

function testPlan(suffix: string): InstallmentPlan {
  const now = new Date().toISOString();
  return {
    id: `plan-lifetime-speed-${suffix}`,
    orderId: `ord-plan-${suffix}`,
    studentId: `student-plan-${suffix}`,
    productId: `prod-plan-${suffix}`,
    productName: "ATPL package",
    courseIds: ["course-plan"],
    countryCode: "KW",
    mode: "installments",
    status: "active",
    currency: "KWD",
    totalAmount: 4000,
    installmentCount: 4,
    agreementAcceptedAt: now,
    agreementVersion: "1",
    passportDocumentId: null,
    suspendedAt: null,
    resumedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function testSchedule(suffix: string): InstallmentScheduleItem {
  const now = new Date().toISOString();
  return {
    id: `sched-lifetime-speed-${suffix}`,
    planId: `plan-lifetime-speed-${suffix}`,
    sequence: 1,
    amount: 1000,
    currency: "KWD",
    dueAt: now,
    status: "due",
    paidAt: null,
    paymentId: null,
    reminderSentAt: [],
    lastReminderAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("indexed installment store", () => {
  afterEach(() => {
    replaceAllInstallmentPlans(
      listAllInstallmentPlans().filter((row) => !row.id.startsWith("plan-lifetime-speed-")),
    );
    replaceAllInstallmentSchedule(
      listAllInstallmentSchedule().filter((row) => !row.id.startsWith("sched-lifetime-speed-")),
    );
    resetInstallmentStoreRuntime();
  });

  it("returns one student plan and its schedule without scanning the catalog", () => {
    const first = testPlan("alpha");
    const second = testPlan("beta");
    upsertInstallmentPlan(first);
    upsertInstallmentPlan(second);
    upsertScheduleItem(testSchedule("alpha"));
    resetInstallmentStoreRuntime();

    expect(listInstallmentPlansForStudent(first.studentId)).toEqual([
      expect.objectContaining({ id: first.id, studentId: first.studentId }),
    ]);
    expect(getInstallmentPlanById(first.id)?.orderId).toBe(first.orderId);
    expect(listScheduleForPlan(first.id)).toEqual([
      expect.objectContaining({ id: "sched-lifetime-speed-alpha", planId: first.id }),
    ]);
  });

  it("extracts installment rows written through the payments catalog view", () => {
    const plan = testPlan("extract");
    const item = testSchedule("extract");
    writePaymentsDb((db) => {
      db.installmentPlans.push(plan);
      db.installmentSchedule.push(item);
    });
    resetInstallmentStoreRuntime();
    expect(getInstallmentPlanById(plan.id)?.studentId).toBe(plan.studentId);
    expect(listScheduleForPlan(plan.id).some((row) => row.id === item.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-payments.json"), "utf8"),
    ) as { installmentPlans?: unknown[]; installmentSchedule?: unknown[] };
    expect(catalog.installmentPlans ?? []).toEqual([]);
    expect(catalog.installmentSchedule ?? []).toEqual([]);
  });
});

function testWalletTxn(suffix: string): WalletTransaction {
  const now = new Date().toISOString();
  return {
    id: `wtxn-lifetime-speed-${suffix}`,
    walletId: `wallet-lifetime-speed-${suffix}`,
    instructorId: `instructor-lifetime-speed-${suffix}`,
    type: "course_sale",
    direction: "credit",
    amount: 2500,
    currency: "KWD",
    availableDelta: 2500,
    pendingDelta: 0,
    orderId: `ord-wtxn-${suffix}`,
    payoutId: null,
    description: "lifetime wallet extract",
    createdAt: now,
  };
}

function testTxnLog(suffix: string, createdAt = new Date().toISOString()): TransactionLog {
  return {
    id: `tlog-lifetime-speed-${suffix}`,
    kind: "payment",
    referenceId: `ref-${suffix}`,
    actorId: "actor-lifetime-speed",
    studentId: `student-tlog-${suffix}`,
    instructorId: null,
    amount: 1000,
    currency: "KWD",
    description: "lifetime payment log",
    metadata: {},
    createdAt,
  };
}

describe("indexed payment activity store", () => {
  afterEach(() => {
    replaceAllWalletTransactions(
      listAllWalletTransactions().filter((row) => !row.id.startsWith("wtxn-lifetime-speed-")),
    );
    replaceAllTransactionLogs(
      listAllTransactionLogs().filter((row) => !row.id.startsWith("tlog-lifetime-speed-")),
    );
    resetPaymentActivityStoreRuntime();
  });

  it("returns one instructor wallet ledger without scanning the catalog", () => {
    const first = testWalletTxn("alpha");
    const second = testWalletTxn("beta");
    upsertWalletTransaction(first);
    upsertWalletTransaction(second);
    resetPaymentActivityStoreRuntime();

    expect(listWalletTransactionsForInstructor(first.instructorId)).toEqual([
      expect.objectContaining({ id: first.id, instructorId: first.instructorId }),
    ]);
    expect(
      listWalletTransactionsForInstructor(second.instructorId).some((row) => row.id === first.id),
    ).toBe(false);
  });

  it("keeps the newest payment logs and never caps wallet rows", () => {
    expect(PAYMENT_LOG_CAP).toBe(400);
    const overflow = Array.from({ length: PAYMENT_LOG_CAP + 40 }, (_, index) =>
      testTxnLog(`overflow-${index}`, new Date(2026, 0, 1, 0, 0, index).toISOString()),
    );
    const kept = trimTransactionLogs(overflow);
    expect(kept).toHaveLength(PAYMENT_LOG_CAP);
    expect(kept[0]?.id).toBe(`tlog-lifetime-speed-overflow-${PAYMENT_LOG_CAP + 39}`);

    const existingLogs = listAllTransactionLogs().filter(
      (row) => !row.id.startsWith("tlog-lifetime-speed-"),
    );
    replaceAllTransactionLogs([...existingLogs, ...overflow]);
    expect(listAllTransactionLogs().length).toBeLessThanOrEqual(PAYMENT_LOG_CAP);
    expect(listRecentTransactionLogs(10).length).toBeLessThanOrEqual(10);

    const existingWallet = listAllWalletTransactions().filter(
      (row) => !row.id.startsWith("wtxn-lifetime-speed-"),
    );
    const walletRows = Array.from({ length: 12 }, (_, index) => testWalletTxn(`keep-${index}`));
    replaceAllWalletTransactions([...existingWallet, ...walletRows]);
    expect(
      listAllWalletTransactions().filter((row) => row.id.startsWith("wtxn-lifetime-speed-keep-")),
    ).toHaveLength(12);
  });

  it("extracts wallet and log rows written through the payments catalog view", () => {
    const txn = testWalletTxn("extract");
    const log = testTxnLog("extract");
    writePaymentsDb((db) => {
      db.walletTransactions.push(txn);
      db.transactionLogs.push(log);
    });
    resetPaymentActivityStoreRuntime();
    expect(
      listWalletTransactionsForInstructor(txn.instructorId).some((row) => row.id === txn.id),
    ).toBe(true);
    expect(listRecentTransactionLogs(20).some((row) => row.id === log.id)).toBe(true);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-payments.json"), "utf8"),
    ) as { walletTransactions?: unknown[]; transactionLogs?: unknown[] };
    expect(catalog.walletTransactions ?? []).toEqual([]);
    expect(catalog.transactionLogs ?? []).toEqual([]);
  });
});

function testIdentityUser(suffix: string): StoredUser {
  const now = new Date().toISOString();
  return {
    id: `user-lifetime-speed-${suffix}`,
    email: `lifetime.speed.${suffix}@aviatorpass.test`,
    firstName: "Speed",
    lastName: suffix,
    phone: null,
    countryCode: null,
    nationality: null,
    dateOfBirth: null,
    gender: null,
    city: null,
    bio: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    avatarUrl: null,
    timezone: "UTC",
    language: "en",
    role: "student",
    status: "active",
    emailVerified: true,
    profileComplete: true,
    mustChangePassword: false,
    passwordHash: null,
    passwordSalt: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function testIdentitySession(suffix: string): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: `sess-lifetime-speed-${suffix}`,
    userId: `user-lifetime-speed-${suffix}`,
    tokenHash: `hash-${suffix}`,
    userAgent: "test",
    ipAddress: "127.0.0.1",
    deviceFingerprint: null,
    deviceLabel: null,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    revokedAt: null,
    createdAt: now,
    lastActiveAt: now,
  };
}

describe("indexed auth identity store", () => {
  afterEach(() => {
    replaceAllUsers(listAllUsers().filter((row) => !row.id.startsWith("user-lifetime-speed-")));
    replaceAllSessions(
      listAllSessions().filter((row) => !row.id.startsWith("sess-lifetime-speed-")),
    );
    resetAuthIdentityStoreRuntime();
  });

  it("returns one user or session without scanning the auth catalog", () => {
    const first = testIdentityUser("alpha");
    const second = testIdentityUser("beta");
    upsertUser(first);
    upsertUser(second);
    upsertSession(testIdentitySession("alpha"));
    resetAuthIdentityStoreRuntime();

    expect(getUserById(first.id)?.email).toBe(first.email);
    expect(getUserByEmail(first.email)?.id).toBe(first.id);
    expect(getSessionById("sess-lifetime-speed-alpha")?.userId).toBe(first.id);
    expect(getUserByEmail(second.email)?.id).toBe(second.id);
  });

  it("extracts users and sessions written through the auth catalog view", () => {
    const user = testIdentityUser("extract");
    const session = testIdentitySession("extract");
    writeAuthDb((db) => {
      db.users.push(user);
      db.sessions.push(session);
    });
    resetAuthIdentityStoreRuntime();
    expect(getUserById(user.id)?.email).toBe(user.email);
    expect(getSessionById(session.id)?.userId).toBe(user.id);
    const catalog = JSON.parse(
      readFileSync(path.join(process.cwd(), ".data", "aep-auth.json"), "utf8"),
    ) as { users?: unknown[]; sessions?: unknown[] };
    expect(catalog.users ?? []).toEqual([]);
    expect(catalog.sessions ?? []).toEqual([]);
  });
});
