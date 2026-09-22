/**
 * Wired notification + email events used in production flows.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { requestOtp } from "@/services/auth/auth-service";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import { dispatchEmailEvent, dispatchRoleAlert } from "@/services/email/automation-service";
import { resetAutomationStoreForTests } from "@/services/email/automation-store";
import { getLatestOutboundTo, getOutboundById } from "@/services/email/outbox";
import { emitNotification, notifyRole } from "@/services/notifications/notification-service";
import { patchStoredSettings } from "@/services/settings/store";
import { EMAIL_AUTOMATION_EVENTS } from "@/types/email-automation";

beforeAll(() => {
  process.env.ENABLE_DEMO_OTP = "true";
  process.env.FORCE_DEMO_OTP = "true";
  process.env.DEMO_OTP_CODE = "123456";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  ensureDemoUsersSeeded();
  resetAutomationStoreForTests();
  patchStoredSettings(
    {
      email: {
        provider: "smtp",
        smtpHost: "",
        smtpPort: 587,
        smtpUsername: "",
        smtpPassword: "",
        encryption: "tls",
        senderName: "AviatorPass",
        senderEmail: "noreply@aviatorpass.test",
        replyToEmail: "support@aviatorpass.test",
        adminNotificationEmail: "ops-matrix@aviatorpass.test",
      },
      notifications: {
        emailNotifications: true,
        inAppNotifications: true,
        reminderEmails: true,
        marketingEmails: false,
        systemAlerts: true,
        classReminderOffsetsMinutes: [1440, 120],
        classReminderFifteenMinutesEnabled: true,
      },
    },
    null,
  );
});

afterAll(() => {
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  patchStoredSettings(
    {
      email: {
        provider: "smtp",
        smtpHost: "",
        smtpPort: 587,
        smtpUsername: "",
        smtpPassword: "",
        encryption: "tls",
        senderName: "AviatorPass",
        senderEmail: "noreply@aviatorpass.test",
        replyToEmail: "support@aviatorpass.test",
        adminNotificationEmail: "",
      },
    },
    null,
  );
});

describe("notification and email matrix", () => {
  it("sends OTP email to the student without duplicating via emitNotification", async () => {
    const req = await requestOtp({
      email: "student@aviatorpass.com",
      purpose: "login",
      rememberMe: true,
    });
    expect(req.success).toBe(true);
    expect(req.data?.emailOutboxId).toBeTruthy();
    const recorded = getOutboundById(req.data!.emailOutboxId!);
    expect(recorded?.subject).toMatch(/verification code/i);
    expect(recorded?.text).toContain("123456");
  });

  it("dispatches every catalog automation event to outbox", async () => {
    const student = findUserByEmail("student@aviatorpass.com")!;
    const sent: string[] = [];
    for (const event of EMAIL_AUTOMATION_EVENTS) {
      const result = await dispatchEmailEvent({
        event,
        userIds: [student.id],
        data: {
          title: `Matrix ${event}`,
          detail: `Lifecycle email for ${event}`,
          reference: `MX-${event}`,
          amountLabel: "KWD 120.000",
        },
        system: true,
      });
      expect(result.sent, event).toBeGreaterThan(0);
      sent.push(event);
    }
    expect(sent).toEqual([...EMAIL_AUTOMATION_EVENTS]);
  });

  it("writes in-app rows for student, instructor, and admin roles", async () => {
    const student = findUserByEmail("student@aviatorpass.com")!;
    const instructor = findUserByEmail("instructor@aviatorpass.com")!;
    await emitNotification({
      userId: student.id,
      title: "Payment successful",
      body: "Basics of Aviation is paid.",
      type: "payment.succeeded",
      email: false,
    });
    await emitNotification({
      userId: student.id,
      title: "Invoice generated",
      body: "INV-MATRIX is ready.",
      type: "invoice.generated",
      email: false,
    });
    await emitNotification({
      userId: student.id,
      title: "Mock exam booked",
      body: "Your ELP slot is confirmed.",
      type: "mock_exam.booked",
      email: false,
    });
    await emitNotification({
      userId: instructor.id,
      title: "Class scheduled",
      body: "A live class was scheduled.",
      type: "class.scheduled",
      email: false,
    });
    await notifyRole("admin", {
      title: "New registration",
      body: "A student registered.",
      type: "admin.registration",
      email: false,
    });
    await dispatchRoleAlert({
      event: "admin_alert",
      title: "Ops copy",
      detail: "Admin inbox received a purchase copy.",
      system: true,
    });

    const rows = readAuthDb().notifications;
    expect(rows.some((n) => n.userId === student.id && n.type === "payment.succeeded")).toBe(true);
    expect(rows.some((n) => n.userId === student.id && n.type === "invoice.generated")).toBe(true);
    expect(rows.some((n) => n.userId === student.id && n.type === "mock_exam.booked")).toBe(true);
    expect(rows.some((n) => n.userId === instructor.id && n.type === "class.scheduled")).toBe(true);
    expect(rows.some((n) => n.type === "admin.registration")).toBe(true);
    expect(getLatestOutboundTo("ops-matrix@aviatorpass.test")).toBeTruthy();
    expect(readAuthDb().users.some((u) => u.role === ROLES.SUPER_ADMIN)).toBe(true);
  });
});
