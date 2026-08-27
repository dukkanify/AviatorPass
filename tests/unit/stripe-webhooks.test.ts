/**
 * Stripe webhook idempotency + purchase-first fulfillment.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { processVerifiedStripeEvent } from "@/services/payments/stripe-webhook-service";
import { getAtplPackageProduct } from "@/services/payments/purchase-first-service";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { generateId } from "@/lib/security/crypto";

function sessionEvent(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  const session = {
    id: `cs_test_${generateId().slice(0, 12)}`,
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    amount_total: 129900,
    amount_subtotal: 129900,
    currency: "usd",
    customer: "cus_test_1",
    customer_email: null,
    payment_intent: "pi_test_1",
    invoice: "in_test_1",
    client_reference_id: overrides.client_reference_id,
    metadata: overrides.metadata ?? {},
    customer_details: {
      email: "stripe.guest@aviatorpass.test",
      name: "Stripe Guest",
      phone: "+12025550123",
      address: {
        line1: "1 Market St",
        line2: null,
        city: "San Francisco",
        state: "CA",
        postal_code: "94105",
        country: "US",
      },
    },
    ...overrides,
  } as Stripe.Checkout.Session;

  return {
    id: `evt_${generateId().slice(0, 14)}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: session },
    livemode: false,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    pending_webhooks: 0,
    request: null,
  } as Stripe.Event;
}

describe("Stripe purchase-first webhooks", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("creates a student, enrollment, and invoice from checkout.session.completed", async () => {
    const product = getAtplPackageProduct();
    expect(product).toBeTruthy();
    const email = `stripe.guest.${Date.now()}@aviatorpass.test`;
    const stamp = new Date().toISOString();
    const orderId = generateId();
    const paymentId = generateId();
    const sessionId = `cs_test_${generateId().slice(0, 10)}`;

    writePaymentsDb((db) => {
      db.orders.unshift({
        id: orderId,
        orderNumber: `ORD-TEST-${Date.now()}`,
        studentId: "guest",
        studentName: "Checkout guest",
        studentEmail: "pending@checkout.invalid",
        status: "pending",
        currency: "USD",
        subtotalAmount: 129900,
        discountAmount: 0,
        taxAmount: 0,
        taxRatePercent: 0,
        totalAmount: 129900,
        couponId: null,
        couponCode: null,
        billingName: "Checkout guest",
        billingEmail: "pending@checkout.invalid",
        billingCountry: "US",
        billingAddress: "",
        items: [
          {
            id: generateId(),
            productId: product!.id,
            productName: product!.name,
            courseId: product!.courseId,
            instructorId: product!.instructorId,
            pricingModel: product!.pricingModel,
            unitAmount: 129900,
            quantity: 1,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: 129900,
          },
        ],
        paymentId,
        invoiceId: null,
        idempotencyKey: `stripe-test-${orderId}`,
        failureReason: null,
        paidAt: null,
        cancelledAt: null,
        expiresAt: null,
        metadata: { purchaseFirst: true, hostedCheckout: true, guestCountry: "US" },
        createdAt: stamp,
        updatedAt: stamp,
      });
      db.payments.unshift({
        id: paymentId,
        orderId,
        provider: "stripe",
        providerPaymentId: sessionId,
        status: "requires_payment",
        methodBrand: "card",
        paymentMethodSummary: "Stripe Checkout",
        amount: 129900,
        currency: "USD",
        clientSecret: null,
        checkoutUrl: "https://checkout.stripe.com/c/pay/test",
        webhookVerified: false,
        failureCode: null,
        failureMessage: null,
        rawProviderPayload: { sessionId },
        createdAt: stamp,
        updatedAt: stamp,
        ...blankStripePaymentFields(),
        checkoutSessionId: sessionId,
      });
    });

    const event = sessionEvent({
      id: sessionId,
      client_reference_id: orderId,
      metadata: { orderId, purchaseFirst: "true" },
      customer_details: {
        email,
        name: "Lina Pilot",
        phone: "+12025550111",
        address: {
          line1: "10 Aviation Way",
          city: "Houston",
          country: "US",
          line2: null,
          state: "TX",
          postal_code: "77001",
        },
        tax_exempt: "none",
        tax_ids: [],
      } as Stripe.Checkout.Session.CustomerDetails,
    });

    const first = await processVerifiedStripeEvent(event);
    expect(first.duplicate).toBe(false);
    expect(first.status).toBe("succeeded");

    const user = findUserByEmail(email);
    expect(user).toBeTruthy();
    expect(user!.role).toBe(ROLES.STUDENT);
    expect(listStudentEnrollments(user!.id).some((e) => e.status === "approved")).toBe(true);

    const tokens = readAuthDb().passwordSetupTokens.filter((t) => t.userId === user!.id);
    expect(tokens.length).toBeGreaterThan(0);

    const replay = await processVerifiedStripeEvent(event);
    expect(replay.duplicate).toBe(true);
    expect(readAuthDb().users.filter((u) => u.email === email).length).toBe(1);

    const payment = readPaymentsDb().payments.find((p) => p.id === paymentId)!;
    expect(payment.webhookVerified).toBe(true);
    expect(payment.checkoutSessionId).toBe(sessionId);
    expect(payment.stripeCustomerId).toBe("cus_test_1");
    expect(payment.paymentIntentId).toBe("pi_test_1");
    expect(payment.country).toBe("US");
  });

  it("does not create a user on payment_intent.payment_failed", async () => {
    const before = readAuthDb().users.length;
    const event = {
      id: `evt_fail_${generateId().slice(0, 8)}`,
      object: "event",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_fail_none",
          object: "payment_intent",
          metadata: { orderId: "missing" },
          last_payment_error: { message: "card declined", code: "card_declined" },
        },
      },
      livemode: false,
    } as unknown as Stripe.Event;
    const result = await processVerifiedStripeEvent(event);
    expect(result.status).toBe("ignored");
    expect(readAuthDb().users.length).toBe(before);
  });

  it("marks a processed refund without duplicating on retry", async () => {
    const product = getAtplPackageProduct();
    const stamp = new Date().toISOString();
    const orderId = generateId();
    const paymentId = generateId();
    writePaymentsDb((db) => {
      db.orders.unshift({
        id: orderId,
        orderNumber: `ORD-REF-${Date.now()}`,
        studentId: "guest",
        studentName: "Refund Case",
        studentEmail: "refund.case@aviatorpass.test",
        status: "paid",
        currency: "USD",
        subtotalAmount: 1000,
        discountAmount: 0,
        taxAmount: 0,
        taxRatePercent: 0,
        totalAmount: 1000,
        couponId: null,
        couponCode: null,
        billingName: "Refund Case",
        billingEmail: "refund.case@aviatorpass.test",
        billingCountry: "US",
        billingAddress: "",
        items: [
          {
            id: generateId(),
            productId: product!.id,
            productName: product!.name,
            courseId: product!.courseId,
            instructorId: product!.instructorId,
            pricingModel: product!.pricingModel,
            unitAmount: 1000,
            quantity: 1,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: 1000,
          },
        ],
        paymentId,
        invoiceId: null,
        idempotencyKey: `ref-${orderId}`,
        failureReason: null,
        paidAt: stamp,
        cancelledAt: null,
        expiresAt: null,
        metadata: { purchaseFirst: true },
        createdAt: stamp,
        updatedAt: stamp,
      });
      db.payments.unshift({
        id: paymentId,
        orderId,
        provider: "stripe",
        providerPaymentId: "pi_ref_1",
        status: "succeeded",
        methodBrand: "card",
        paymentMethodSummary: "Stripe Checkout",
        amount: 1000,
        currency: "USD",
        clientSecret: null,
        checkoutUrl: null,
        webhookVerified: true,
        failureCode: null,
        failureMessage: null,
        rawProviderPayload: { chargeId: "ch_ref_1" },
        createdAt: stamp,
        updatedAt: stamp,
        ...blankStripePaymentFields(),
        paymentIntentId: "pi_ref_1",
      });
    });

    const event = {
      id: `evt_ref_${generateId().slice(0, 8)}`,
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_ref_1",
          object: "charge",
          payment_intent: "pi_ref_1",
          refunded: true,
          amount_refunded: 1000,
          currency: "usd",
        },
      },
      livemode: false,
    } as unknown as Stripe.Event;

    const first = await processVerifiedStripeEvent(event);
    expect(first.status).toBe("refunded");
    expect(readPaymentsDb().payments.find((p) => p.id === paymentId)?.status).toBe("refunded");
    const refundCount = readPaymentsDb().refunds.filter((r) => r.paymentId === paymentId).length;
    const replay = await processVerifiedStripeEvent(event);
    expect(replay.duplicate).toBe(true);
    expect(readPaymentsDb().refunds.filter((r) => r.paymentId === paymentId).length).toBe(
      refundCount,
    );
  });
});
