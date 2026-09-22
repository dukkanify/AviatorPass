/**
 * Refund approve/reject must email the student and copy admin.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { generateId } from "@/lib/security/crypto";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb, toUserProfile } from "@/services/auth/store";
import { resetAutomationStoreForTests } from "@/services/email/automation-store";
import { getLatestOutboundTo, listOutboundEmails } from "@/services/email/outbox";
import { requestRefund, reviewRefund } from "@/services/payments/refund-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import { patchStoredSettings } from "@/services/settings/store";
import type { UserProfile } from "@/types";

beforeEach(() => {
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  ensureDemoUsersSeeded();
  ensurePaymentsSeeded();
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
        adminNotificationEmail: "ops-refund@aviatorpass.test",
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
        adminNotificationEmail: "",
      },
    },
    null,
  );
});

function paidOrderFor(student: UserProfile) {
  const stamp = new Date().toISOString();
  const orderId = generateId();
  const paymentId = generateId();
  writePaymentsDb((db) => {
    db.orders.unshift({
      id: orderId,
      orderNumber: `ORD-REFUND-${orderId.slice(0, 6)}`,
      studentId: student.id,
      studentName: student.fullName ?? student.email,
      studentEmail: student.email,
      status: "paid",
      currency: "KWD",
      subtotalAmount: 120000,
      discountAmount: 0,
      taxAmount: 0,
      taxRatePercent: 0,
      totalAmount: 120000,
      couponId: null,
      couponCode: null,
      billingName: student.fullName ?? student.email,
      billingEmail: student.email,
      billingCountry: "KW",
      billingAddress: "",
      items: [
        {
          id: generateId(),
          productId: "prod-basics",
          productName: "Basics of Aviation",
          courseId: null,
          instructorId: null,
          pricingModel: "one_time",
          unitAmount: 120000,
          quantity: 1,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 120000,
        },
      ],
      paymentId,
      invoiceId: null,
      idempotencyKey: `refund-${orderId}`,
      failureReason: null,
      paidAt: stamp,
      cancelledAt: null,
      expiresAt: null,
      metadata: {},
      createdAt: stamp,
      updatedAt: stamp,
    });
    db.payments.unshift({
      id: paymentId,
      orderId,
      provider: "stripe",
      providerPaymentId: `pi_${orderId.slice(0, 8)}`,
      status: "succeeded",
      methodBrand: "card",
      paymentMethodSummary: "card",
      amount: 120000,
      currency: "KWD",
      clientSecret: null,
      checkoutUrl: null,
      stripeCustomerId: null,
      checkoutSessionId: null,
      paymentIntentId: `pi_${orderId.slice(0, 8)}`,
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
      studentId: student.id,
      courseId: null,
      stripeEventId: null,
      invoiceNumber: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
  return readPaymentsDb().orders.find((o) => o.id === orderId)!;
}

describe("refund notification emails", () => {
  it("emails the student and copies admin when a refund is approved", async () => {
    const student = toUserProfile(findUserByEmail("student@aviatorpass.com")!);
    const admin = toUserProfile(findUserByEmail("superadmin@aviatorpass.com")!);
    const order = paidOrderFor(student);
    const refund = await requestRefund({
      user: student,
      orderId: order.id,
      reason: "Student requested a refund for testing.",
    });
    const beforeIds = new Set(listOutboundEmails(200).map((m) => m.id));
    await reviewRefund({
      user: admin,
      refundId: refund.id,
      decision: "approve",
    });

    const studentMail = getLatestOutboundTo(student.email);
    expect(studentMail?.meta?.event).toBe("refund");
    expect(studentMail?.subject).toMatch(/refund approved/i);
    expect(studentMail?.text).toMatch(/processed/i);
    expect(studentMail && !beforeIds.has(studentMail.id)).toBe(true);
    const adminMail = getLatestOutboundTo("ops-refund@aviatorpass.test");
    expect(adminMail).toBeTruthy();
    expect(adminMail && !beforeIds.has(adminMail.id)).toBe(true);

    const inbox = readAuthDb().notifications.filter(
      (n) => n.userId === student.id && n.type === "refund.approved",
    );
    expect(inbox.length).toBeGreaterThan(0);
    const adminInbox = readAuthDb().notifications.filter((n) => n.type === "admin.refund");
    expect(adminInbox.length).toBeGreaterThan(0);
  });

  it("emails the student when a refund is rejected", async () => {
    const student = toUserProfile(findUserByEmail("student@aviatorpass.com")!);
    const admin = toUserProfile(findUserByEmail("superadmin@aviatorpass.com")!);
    const order = paidOrderFor(student);
    const refund = await requestRefund({
      user: student,
      orderId: order.id,
      reason: "Student requested a refund for rejection path.",
    });
    await reviewRefund({
      user: admin,
      refundId: refund.id,
      decision: "reject",
      adminNotes: "Outside the refund window.",
    });

    const studentMail = getLatestOutboundTo(student.email);
    expect(studentMail?.meta?.event).toBe("refund");
    expect(studentMail?.subject).toMatch(/refund rejected/i);
    expect(studentMail?.text).toMatch(/rejected/i);
    expect(studentMail?.text).not.toMatch(/has been issued/i);
    const adminMail = getLatestOutboundTo("ops-refund@aviatorpass.test");
    expect(adminMail?.meta?.kind).toBe("admin_copy");
    const inbox = readAuthDb().notifications.filter(
      (n) => n.userId === student.id && n.type === "refund.rejected",
    );
    expect(inbox.length).toBeGreaterThan(0);
  });
});
