import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { sendEmail } from "@/services/email/mailer";
import { getLatestOutboundTo, listOutboundEmails, listRetryableOutbound } from "@/services/email/outbox";
import { resetAutomationStoreForTests } from "@/services/email/automation-store";
import { notificationTypeToEmailEvent } from "@/services/notifications/notification-service";
import {
  certificateIssuedEmailTemplate,
  enrollmentEmailTemplate,
  otpEmailTemplate,
  purchaseConfirmationEmailTemplate,
  renderBrandedEmail,
  welcomeEmailTemplate,
} from "@/services/settings/email-templates";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";
import { patchStoredSettings } from "@/services/settings/store";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  ensureDemoUsersSeeded();
  resetAutomationStoreForTests();
  patchStoredSettings(
    {
      email: {
        ...DEFAULT_PLATFORM_SETTINGS.email,
        smtpHost: "",
        senderEmail: "noreply@aviatorpass.test",
        adminNotificationEmail: "",
      },
      notifications: {
        ...DEFAULT_PLATFORM_SETTINGS.notifications,
        emailNotifications: true,
      },
    },
    null,
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("email delivery", () => {
  it("renders branded templates with production URL and logo", () => {
    const welcome = welcomeEmailTemplate({ firstName: "Lina" });
    expect(welcome.html).toContain("Welcome to AviatorPass");
    expect(welcome.html).toContain("/brand/logo.png");
    expect(welcome.html).toContain("https://www.aviatorpass.com");
    expect(welcome.html).toContain("color-scheme");
    expect(otpEmailTemplate("123456", "sign in").html).toContain("123456");
    expect(purchaseConfirmationEmailTemplate({ productName: "ATPL" }).html).toContain("ATPL");
    expect(enrollmentEmailTemplate({ courseName: "ATPL" }).html).toContain("enrolled");
    expect(certificateIssuedEmailTemplate({ title: "ATPL" }).html).toContain("Certificate issued");
    const branded = renderBrandedEmail({ title: "Test", bodyHtml: "<p>Hi</p>" });
    expect(branded.html).toContain("prefers-color-scheme");
  });

  it("stores failed Resend-like errors on the retry queue", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    const result = await sendEmail({
      to: "pilot@example.com",
      subject: "Queue me",
      html: "<p>Hi</p>",
      text: "Hi",
      meta: { kind: "test", system: true },
    });
    expect(result.mode).toBe("outbox");
    expect(result.success).toBe(true);
  });

  it("copies registration mail to the configured admin inbox without duplicating the student", async () => {
    const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active")!;
    process.env.ADMIN_NOTIFICATION_EMAIL = "ops@aviatorpass.test";
    const welcome = await dispatchEmailEvent({
      event: "registration",
      userIds: [student.id],
      data: { detail: "Welcome aboard." },
      actorId: student.id,
    });
    expect(welcome.sent).toBe(2);
    expect(getLatestOutboundTo("ops@aviatorpass.test")?.meta?.kind).toBe("admin_copy");
    expect(getLatestOutboundTo(student.email)?.meta?.event).toBe("registration");
  });

  it("maps notification types to automation events", () => {
    expect(notificationTypeToEmailEvent("account.welcome")).toBe("registration");
    expect(notificationTypeToEmailEvent("payment.refunded")).toBe("refund");
    expect(notificationTypeToEmailEvent("class.reminder_24h")).toBe("reminder");
    expect(notificationTypeToEmailEvent("admin.purchase")).toBe("admin_alert");
    expect(notificationTypeToEmailEvent("account.otp_sent")).toBe("student_alert");
  });

  it("does not enqueue missing-recipient failures", async () => {
    const result = await sendEmail({
      to: "   ",
      subject: "Nope",
      html: "<p>x</p>",
      text: "x",
      meta: { kind: "test", system: true },
    });
    expect(result.mode).toBe("failed");
    expect(listRetryableOutbound().some((m) => m.id === result.outboxId)).toBe(false);
    expect(listOutboundEmails(5).some((m) => m.id === result.outboxId)).toBe(true);
  });
});
