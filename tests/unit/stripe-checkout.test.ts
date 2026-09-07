/**
 * Stripe Checkout service — currencies, session lookup, webhook signatures.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";

import { GET as sessionGet } from "@/app/api/payments/session/route";
import { GET as webhookGet, POST as webhookPost } from "@/app/api/payments/webhook/route";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { createCheckoutSession } from "@/services/stripe/checkout";
import { isStripeCheckoutCurrency } from "@/services/stripe/config";
import { resetStripeStoreForTests, upsertCheckout } from "@/services/stripe/store";
import type { StripeCheckoutRecord } from "@/services/stripe/types";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_stripe_checkout";
  delete process.env.STRIPE_SECRET_KEY;
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  resetStripeStoreForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Stripe Checkout currencies", () => {
  it("supports AED, USD, KWD, and SAR", () => {
    expect(["AED", "USD", "KWD", "SAR"].every(isStripeCheckoutCurrency)).toBe(true);
    expect(isStripeCheckoutCurrency("EUR")).toBe(false);
  });
});

describe("createCheckoutSession", () => {
  it("rejects unsupported currencies", async () => {
    await expect(
      createCheckoutSession({
        courseId: "atpl",
        currency: "EUR",
        amount: 1000,
      }),
    ).rejects.toThrow(/AED, USD, KWD, or SAR/);
  });

  it("requires Stripe to be configured", async () => {
    await expect(
      createCheckoutSession({
        courseId: "atpl",
        currency: "USD",
        amount: 129900,
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe("GET /api/payments/session", () => {
  it("returns a stored Checkout Session without exposing secrets", async () => {
    const record: StripeCheckoutRecord = {
      id: "chk_test",
      stripeSessionId: "cs_test_public_lookup",
      stripePaymentIntentId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeConnectAccountId: null,
      mode: "payment",
      status: "pending",
      courseId: "course_1",
      studentId: "student_1",
      instructorId: "instructor_1",
      currency: "USD",
      amount: 129900,
      enrollmentId: null,
      orderId: "ord_1",
      paymentId: "pay_1",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      successUrl: "https://www.aviatorpass.com/payment/success",
      cancelUrl: "https://www.aviatorpass.com/payment/cancel",
      failureMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAt: null,
    };
    upsertCheckout(record);
    const res = await sessionGet(
      new Request(
        "https://www.aviatorpass.com/api/payments/session?session_id=cs_test_public_lookup",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.sessionId).toBe("cs_test_public_lookup");
    expect(json.data.status).toBe("pending");
    expect(JSON.stringify(json)).not.toMatch(/sk_|whsec_|rk_/);
  });
});

describe("POST /api/payments/webhook", () => {
  it("returns 405 for GET", () => {
    const res = webhookGet();
    expect(res.status).toBe(405);
  });

  it("rejects a missing signature", async () => {
    const res = await webhookPost(
      new Request("https://www.aviatorpass.com/api/payments/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature", async () => {
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } },
    });
    const res = await webhookPost(
      new Request("https://www.aviatorpass.com/api/payments/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
        body: payload,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a Stripe-signed payload", async () => {
    const payload = JSON.stringify({
      id: "evt_signed_test",
      object: "event",
      type: "ping",
      data: { object: { id: "cs_test" } },
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      pending_webhooks: 0,
      request: null,
      api_version: "2026-08-26.dahlia",
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test_stripe_checkout",
    });
    const res = await webhookPost(
      new Request("https://www.aviatorpass.com/api/payments/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });
});
