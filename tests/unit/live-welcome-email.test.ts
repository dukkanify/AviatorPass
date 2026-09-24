/**
 * Official PPL / Basics Live Online: welcome email 3 days after payment.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { generateId } from "@/lib/security/crypto";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import { resetAutomationStoreForTests } from "@/services/email/automation-store";
import { listOutboundEmails } from "@/services/email/outbox";
import { processEmailQueue } from "@/services/email/queue";
import {
  ensureCustomerJourneyCourses,
  ensureCustomerJourneyProducts,
} from "@/services/journeys/customer-journey-catalog";
import {
  LIVE_PROGRAM_WELCOME_DELAY_MS,
  liveProgramWelcomeItems,
  processDueLiveProgramWelcomes,
  scheduleLiveProgramWelcome,
} from "@/services/payments/live-welcome-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import { listNotifications } from "@/services/notifications/notification-service";
import { patchStoredSettings } from "@/services/settings/store";
import type { Order } from "@/types/payments";

function newEmails(beforeIds: Set<string>) {
  return listOutboundEmails(120).filter((message) => !beforeIds.has(message.id));
}

function paidOrder(sku: string): Order {
  const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
  const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
  const product = readPaymentsDb().products.find((row) => row.metadata?.sku === sku);
  if (!product) throw new Error(`Missing product ${sku}`);
  const stamp = new Date().toISOString();
  const orderId = generateId();
  const paymentId = generateId();
  const order: Order = {
    id: orderId,
    orderNumber: `ORD-LIVE-${orderId.slice(0, 6)}`,
    studentId: student.id,
    studentName: [student.firstName, student.lastName].filter(Boolean).join(" ") || student.email,
    studentEmail: student.email,
    status: "paid",
    currency: "KWD",
    subtotalAmount: product.priceAmount,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: product.priceAmount,
    couponId: null,
    couponCode: null,
    billingName: student.email,
    billingEmail: student.email,
    billingCountry: "KW",
    billingAddress: "",
    items: [
      {
        id: generateId(),
        productId: product.id,
        productName: product.name,
        courseId: product.courseId,
        instructorId: instructor.id,
        pricingModel: "one_time",
        unitAmount: product.priceAmount,
        quantity: 1,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: product.priceAmount,
      },
    ],
    paymentId,
    invoiceId: null,
    idempotencyKey: `live-welcome-${orderId}`,
    failureReason: null,
    paidAt: stamp,
    cancelledAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: stamp,
    updatedAt: stamp,
  };
  writePaymentsDb((db) => {
    db.orders.unshift(order);
  });
  return order;
}

describe("live program 3-day welcome", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    ensurePaymentsSeeded();
    ensureCustomerJourneyCourses();
    ensureCustomerJourneyProducts();
    resetAutomationStoreForTests();
    patchStoredSettings(
      {
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

  it("schedules PPL Live and Basics Live, and ignores recorded / ATPL", () => {
    const ppl = paidOrder("PPL-LIVE");
    const basics = paidOrder("BASICS-LIVE");
    const recorded = paidOrder("PPL-RECORDED");
    const atpl = paidOrder("ATPL-PACKAGE");

    expect(liveProgramWelcomeItems(ppl)).toHaveLength(1);
    expect(liveProgramWelcomeItems(basics)).toHaveLength(1);
    expect(liveProgramWelcomeItems(recorded)).toHaveLength(0);
    expect(liveProgramWelcomeItems(atpl)).toHaveLength(0);

    const now = new Date("2026-09-23T08:00:00.000Z");
    const scheduled = scheduleLiveProgramWelcome(ppl, { now });
    expect(scheduled?.sku).toBe("PPL-LIVE");
    expect(Date.parse(scheduled!.dueAt) - now.getTime()).toBe(LIVE_PROGRAM_WELCOME_DELAY_MS);
    expect(scheduleLiveProgramWelcome(recorded, { now })).toBeNull();
    expect(scheduleLiveProgramWelcome(atpl, { now })).toBeNull();
  });

  it("sends the official welcome only after the 3-day window", async () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const instructor = findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)!;
    const superAdmin = findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin)!;
    const order = paidOrder("PPL-LIVE");
    const paidAt = new Date("2026-09-20T08:00:00.000Z");
    scheduleLiveProgramWelcome(order, { now: paidAt });

    const beforeDue = newEmails(new Set(listOutboundEmails(120).map((row) => row.id)));
    const early = await processDueLiveProgramWelcomes({
      now: new Date(paidAt.getTime() + 2 * 24 * 60 * 60 * 1000),
    });
    expect(early.sent).toBe(0);
    expect(beforeDue.some((row) => /live program starts today/i.test(row.subject))).toBe(false);

    const beforeIds = new Set(listOutboundEmails(120).map((row) => row.id));
    const due = await processDueLiveProgramWelcomes({
      now: new Date(paidAt.getTime() + LIVE_PROGRAM_WELCOME_DELAY_MS),
    });
    expect(due.sent).toBe(1);
    expect(due.results[0]?.subject).toMatch(/Welcome to Private Pilot License — Live Online/);
    expect(due.results[0]?.subject).toMatch(/your live program starts today/);

    const sent = newEmails(beforeIds);
    expect(
      sent.some(
        (row) =>
          row.to.toLowerCase() === student.email.toLowerCase() &&
          /your live program starts today/i.test(row.subject),
      ),
    ).toBe(true);
    const studentMail = sent.find(
      (row) =>
        row.to.toLowerCase() === student.email.toLowerCase() &&
        /your live program starts today/i.test(row.subject),
    )!;
    expect(studentMail.html).toMatch(/Instructor:/i);
    expect(studentMail.html).toMatch(/Private Pilot License/i);
    expect(studentMail.html).toMatch(/Zoom/i);

    expect(sent.some((row) => row.to.toLowerCase() === instructor.email.toLowerCase())).toBe(true);
    expect(sent.some((row) => row.to.toLowerCase() === superAdmin.email.toLowerCase())).toBe(true);
    expect(
      listNotifications(student.id).data.some((row) => row.type === "student.live_welcome"),
    ).toBe(true);

    const again = await processDueLiveProgramWelcomes({
      now: new Date(paidAt.getTime() + LIVE_PROGRAM_WELCOME_DELAY_MS + 60_000),
    });
    expect(again.sent).toBe(0);
  });

  it("lets the email cron process a due live welcome", async () => {
    const order = paidOrder("BASICS-LIVE");
    scheduleLiveProgramWelcome(order, { delayMs: 0 });
    const beforeIds = new Set(listOutboundEmails(120).map((row) => row.id));
    const cron = await processEmailQueue(20);
    expect(cron.liveWelcomes.sent).toBeGreaterThan(0);
    const sent = newEmails(beforeIds);
    expect(
      sent.some((row) => /Welcome to Basics of Aviation — Live Online/i.test(row.subject)),
    ).toBe(true);
  });
});
