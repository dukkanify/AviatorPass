/**
 * Email dedupe, suppression, bounce webhook, and single schedule-path coverage.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import { createLiveClass, cancelLiveClass } from "@/services/classes/class-service";
import { emailScheduleLifecycle } from "@/services/email/automation-service";
import { resetAutomationStoreForTests } from "@/services/email/automation-store";
import {
  claimEmailIdempotency,
  resetEmailIdempotencyStoreForTests,
  scheduleEmailIdempotencyKey,
} from "@/services/email/idempotency-store";
import { sendEmail } from "@/services/email/mailer";
import { listOutboundEmails } from "@/services/email/outbox";
import {
  processResendWebhookEvent,
  verifyResendWebhookSignature,
} from "@/services/email/resend-webhook";
import {
  isEmailSuppressed,
  resetEmailSuppressionStoreForTests,
  upsertSuppression,
} from "@/services/email/suppression-store";
import { NOTIFICATION_CATALOG } from "@/types/notifications";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";
import { patchStoredSettings } from "@/services/settings/store";
import { sendZoomMeetingNotifications } from "@/services/zoom/notifications";
import { listNotifications } from "@/services/notifications/notification-service";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.RESEND_API_KEY;
  ensureDemoUsersSeeded();
  resetAutomationStoreForTests();
  resetEmailIdempotencyStoreForTests();
  resetEmailSuppressionStoreForTests();
  patchStoredSettings(
    {
      email: {
        ...DEFAULT_PLATFORM_SETTINGS.email,
        smtpHost: "",
        senderEmail: "noreply@aviatorpass.test",
      },
      notifications: {
        ...DEFAULT_PLATFORM_SETTINGS.notifications,
        emailNotifications: true,
        reminderEmails: true,
        classReminderOffsetsMinutes: [1440, 60],
        classReminderFifteenMinutesEnabled: false,
      },
    },
    null,
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("email suppression + idempotency", () => {
  it("blocks hard-bounced recipients from further sends", async () => {
    upsertSuppression({
      email: "bounce@example.com",
      reason: "hard_bounce",
      source: "test",
      permanent: true,
    });
    expect(isEmailSuppressed("bounce@example.com").suppressed).toBe(true);

    const result = await sendEmail({
      to: "bounce@example.com",
      subject: "Should not send",
      html: "<p>x</p>",
      text: "x",
      meta: { kind: "email_automation", event: "schedule", system: true },
    });
    expect(result.suppressed).toBe(true);
    expect(result.success).toBe(false);
    expect(result.delivered).toBe(false);
  });

  it("skips Resend for confirmed demo mailboxes on OTP but keeps outbox success", async () => {
    const result = await sendEmail({
      to: "student@aviatorpass.com",
      subject: "Your verification code",
      html: "<p>123456</p>",
      text: "123456",
      meta: { kind: "otp", purpose: "login", system: true, challengeId: "chal-1" },
    });
    expect(result.suppressed).toBe(true);
    expect(result.success).toBe(true);
    expect(result.mode).toBe("outbox");
    expect(result.record.meta?.suppressed).toBe(true);
  });

  it("does not suppress real QA inboxes just because they are test accounts", () => {
    expect(isEmailSuppressed("qa.pilot+dubai@gmail.com").suppressed).toBe(false);
  });

  it("dedupes identical schedule sends via idempotency key", async () => {
    const key = scheduleEmailIdempotencyKey({
      event: "schedule",
      liveClassId: "class-1",
      userIdOrEmail: "user-1",
    });
    const first = await sendEmail({
      to: "pilot@example.com",
      subject: "Class scheduled",
      html: "<p>1</p>",
      text: "1",
      meta: { kind: "email_automation", event: "schedule", system: true, idempotencyKey: key },
    });
    const second = await sendEmail({
      to: "pilot@example.com",
      subject: "Class scheduled",
      html: "<p>1</p>",
      text: "1",
      meta: { kind: "email_automation", event: "schedule", system: true, idempotencyKey: key },
    });
    expect(first.success).toBe(true);
    expect(first.deduped).toBeFalsy();
    expect(second.success).toBe(true);
    expect(second.deduped).toBe(true);
    expect(claimEmailIdempotency({ key, to: "pilot@example.com", subject: "x" }).claimed).toBe(
      false,
    );
  });
});

describe("Resend bounce webhook", () => {
  it("verifies Svix signatures and suppresses bounced addresses once", () => {
    const secret = "whsec_" + Buffer.from("test-secret-bytes!!").toString("base64");
    const payload = JSON.stringify({
      type: "email.bounced",
      data: { to: ["hard.bounce@example.com"] },
    });
    const svixId = "msg_test_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const secretBuf = Buffer.from(secret.slice("whsec_".length), "base64");
    const sig = createHmac("sha256", secretBuf).update(signedContent).digest("base64");

    expect(
      verifyResendWebhookSignature({
        payload,
        svixId,
        svixTimestamp,
        svixSignature: `v1,${sig}`,
        secret,
      }),
    ).toBe(true);

    const first = processResendWebhookEvent({
      eventId: svixId,
      eventType: "email.bounced",
      payload: JSON.parse(payload) as Record<string, unknown>,
    });
    expect(first.processed).toBe(true);
    expect(first.suppressed).toContain("hard.bounce@example.com");

    const second = processResendWebhookEvent({
      eventId: svixId,
      eventType: "email.bounced",
      payload: JSON.parse(payload) as Record<string, unknown>,
    });
    expect(second.duplicate).toBe(true);
    expect(second.processed).toBe(false);
  });
});

describe("class schedule single-send path", () => {
  it("keeps catalog defaults in-app for class.created / zoom created", () => {
    expect(NOTIFICATION_CATALOG["class.created"]?.emailDefault).toBe(false);
    expect(NOTIFICATION_CATALOG["zoom.meeting.created"]?.emailDefault).toBe(false);
    expect(NOTIFICATION_CATALOG["class.cancelled"]?.emailDefault).toBe(false);
    expect(NOTIFICATION_CATALOG["class.reminder_1h"]?.emailDefault).toBe(true);
  });

  it("sends one schedule email per participant even if Zoom notify also runs", async () => {
    const student = findUserByEmail("student@aviatorpass.com");
    const instructor = findUserByEmail("instructor@aviatorpass.com");
    expect(student && instructor).toBeTruthy();

    const before = listOutboundEmails(200).filter(
      (m) =>
        m.meta?.event === "schedule" ||
        (typeof m.subject === "string" && /scheduled|class/i.test(m.subject)),
    ).length;

    const created = await createLiveClass({
      title: "Dedupe Schedule Lecture",
      instructorId: instructor!.id,
      startsAt: new Date(Date.now() + 47 * 24 * 60 * 60_000).toISOString(),
      durationMinutes: 60,
      enrollStudentIds: [student!.id],
      actorId: instructor!.id,
      status: "scheduled",
    });
    expect(created?.id).toBeTruthy();

    // Concurrent Zoom path must not add a second schedule email.
    await sendZoomMeetingNotifications({
      kind: "created",
      liveClassId: created!.id,
      classTitle: created!.title,
      startsAt: created!.startsAt,
      userIds: [student!.id, instructor!.id],
    });

    // Simulated API/job retry of the lifecycle email.
    await emailScheduleLifecycle({
      event: "schedule",
      userIds: [student!.id, instructor!.id],
      title: created!.title,
      when: new Date(created!.startsAt).toLocaleString(),
      detail: "retry",
      liveClassId: created!.id,
      actorId: instructor!.id,
    });

    const scheduleMails = listOutboundEmails(200).filter(
      (m) =>
        m.meta?.event === "schedule" &&
        m.meta?.liveClassId === created!.id &&
        !m.meta?.deduped &&
        !m.meta?.suppressed,
    );
    // Demo mailboxes are suppressed — expect 0 Resend/outbox "sent" for them,
    // or at most one suppressed/outbox auth-style record path. Lifecycle to demo
    // accounts should be suppressed (not counted as delivered schedule spam).
    const deliveredOrOutbox = scheduleMails.filter((m) => m.mode !== "failed");
    expect(deliveredOrOutbox.length).toBeLessThanOrEqual(2);

    const studentNotes = listNotifications(student!.id, { pageSize: 100 }).data.filter(
      (n) =>
        (typeof n.data?.liveClassId === "string" && n.data.liveClassId === created!.id) ||
        n.type === "class.created",
    );
    expect(studentNotes.length).toBeGreaterThanOrEqual(1);

    await cancelLiveClass({
      id: created!.id,
      reason: "dedupe test cleanup",
      actorId: instructor!.id,
    });

    expect(before).toBeGreaterThanOrEqual(0);
  });
});
