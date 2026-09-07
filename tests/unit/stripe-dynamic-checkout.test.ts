/**
 * Dynamic Stripe Checkout — AviatorPass course is the source of truth.
 * Sessions must use price_data, never Stripe Price IDs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listCourses } from "@/services/courses/course-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getAtplPackageProduct } from "@/services/payments/purchase-first-service";
import { processVerifiedStripeEvent } from "@/services/payments/stripe-webhook-service";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { buildDynamicPriceDataLineItem } from "@/services/stripe/price-data";
import { resolveCourseOffer } from "@/services/stripe/course-offer";
import { createCheckoutSession } from "@/services/stripe/checkout";
import { resetStripeStoreForTests } from "@/services/stripe/store";
import { generateId } from "@/lib/security/crypto";
import type Stripe from "stripe";

const createSession = vi.fn();

vi.mock("@/services/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/stripe/client")>();
  return {
    ...actual,
    isStripeConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    getStripeClient: () => ({
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    }),
  };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dynamic";
  delete process.env.STRIPE_SECRET_KEY;
  createSession.mockReset();
  createSession.mockResolvedValue({
    id: "cs_test_dynamic",
    url: "https://checkout.stripe.com/c/pay/cs_test_dynamic",
    status: "open",
    customer: null,
    payment_intent: null,
    subscription: null,
  });
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  resetStripeStoreForTests();
  writePaymentsDb((db) => {
    db.orders = db.orders.filter((o) => !o.metadata?.stripeCheckout && !o.metadata?.hostedCheckout);
    db.payments = db.payments.filter((p) => p.provider !== "stripe");
    db.processedProviderEvents = [];
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function publishedCourseId(): string {
  const product = getAtplPackageProduct();
  if (product?.courseId) return product.courseId;
  const published = listCourses({ pageSize: 5, status: "published" }).data[0];
  if (!published) throw new Error("No published course for tests");
  return published.id;
}

describe("price_data line items", () => {
  it("never includes a Stripe Price id", () => {
    const item = buildDynamicPriceDataLineItem({
      courseId: "course_1",
      courseSlug: "ATPL-010",
      title: "Air Law",
      description: "ATPL Air Law",
      imageUrl: null,
      instructorId: "inst_1",
      amount: 129900,
      currency: "USD",
      productId: "prod_local",
      pricingModel: "one_time",
      course: null,
      product: null,
    });
    expect(item).not.toHaveProperty("price");
    expect(item.price_data?.currency).toBe("usd");
    expect(item.price_data?.unit_amount).toBe(129900);
    expect(item.price_data?.product_data?.name).toBe("Air Law");
    expect(item.price_data?.product_data?.metadata?.platform).toBe("AviatorPass");
  });
});

describe("resolveCourseOffer", () => {
  it("loads title, price, and currency from AviatorPass", () => {
    const courseId = publishedCourseId();
    const offer = resolveCourseOffer({ courseId });
    expect(offer.courseId).toBeTruthy();
    expect(offer.title.length).toBeGreaterThan(0);
    expect(offer.amount).toBeGreaterThan(0);
    expect(offer.currency).toMatch(/^[A-Z]{3}$/);
  });
});

describe("createCheckoutSession with price_data", () => {
  it.each(["AED", "USD", "KWD", "SAR"] as const)(
    "creates a %s session from the course",
    async (currency) => {
      process.env.STRIPE_SECRET_KEY = "sk_test_dynamic_checkout";
      const courseId = publishedCourseId();
      const result = await createCheckoutSession({
        courseId,
        currency,
        amount: currency === "KWD" ? 150000 : 129900,
        email: "student@aviatorpass.test",
        studentId: "guest",
        idempotencyKey: `dyn-${currency}-${Date.now()}-${Math.random()}`,
      });
      expect(result.url).toContain("checkout.stripe.com");
      expect(result.status).toBe("pending");
      expect(createSession).toHaveBeenCalled();
      const firstCall = createSession.mock.calls[0];
      expect(firstCall).toBeTruthy();
      const params = firstCall![0] as {
        line_items: Array<{
          price?: string;
          price_data?: { currency: string; unit_amount: number };
        }>;
        metadata: Record<string, string>;
      };
      expect(params.line_items[0]?.price).toBeUndefined();
      expect(params.line_items[0]?.price_data?.currency).toBe(currency.toLowerCase());
      expect(params.metadata.platform).toBe("AviatorPass");
      expect(params.metadata.courseId).toBeTruthy();
      expect(params.metadata.currency).toBe(currency);
    },
  );

  it("reuses a pending checkout for the same idempotency key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dynamic_checkout";
    const courseId = publishedCourseId();
    const first = await createCheckoutSession({
      courseId,
      currency: "USD",
      amount: 5000,
      idempotencyKey: "dup-key-1",
    });
    const second = await createCheckoutSession({
      courseId,
      currency: "USD",
      amount: 5000,
      idempotencyKey: "dup-key-1",
    });
    expect(second.sessionId).toBe(first.sessionId);
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

function failedEvent(orderId: string, paymentIntentId: string): Stripe.Event {
  return {
    id: `evt_${generateId().slice(0, 14)}`,
    object: "event",
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: paymentIntentId,
        object: "payment_intent",
        metadata: { orderId },
        last_payment_error: { message: "Your card was declined." },
      } as unknown as Stripe.PaymentIntent,
    },
    livemode: false,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    pending_webhooks: 0,
    request: null,
  } as Stripe.Event;
}

describe("failed payments and duplicates", () => {
  it("marks the order and payment failed without granting access", async () => {
    const orderId = generateId();
    const paymentId = generateId();
    const stamp = new Date().toISOString();
    writePaymentsDb((db) => {
      db.orders.unshift({
        id: orderId,
        orderNumber: "ORD-TEST-FAIL",
        studentId: "guest",
        studentName: "Test",
        studentEmail: "fail@aviatorpass.test",
        status: "pending",
        currency: "USD",
        subtotalAmount: 1000,
        discountAmount: 0,
        taxAmount: 0,
        taxRatePercent: 0,
        totalAmount: 1000,
        couponId: null,
        couponCode: null,
        billingName: "Test",
        billingEmail: "fail@aviatorpass.test",
        billingCountry: "US",
        billingAddress: "",
        items: [],
        paymentId,
        invoiceId: null,
        idempotencyKey: `fail-${orderId}`,
        failureReason: null,
        paidAt: null,
        cancelledAt: null,
        expiresAt: null,
        metadata: { hostedCheckout: true },
        createdAt: stamp,
        updatedAt: stamp,
      });
      db.payments.unshift({
        id: paymentId,
        orderId,
        provider: "stripe",
        providerPaymentId: "pi_fail_1",
        status: "requires_payment",
        methodBrand: "card",
        paymentMethodSummary: "Stripe Checkout",
        amount: 1000,
        currency: "USD",
        clientSecret: null,
        checkoutUrl: null,
        webhookVerified: false,
        failureCode: null,
        failureMessage: null,
        rawProviderPayload: {},
        createdAt: stamp,
        updatedAt: stamp,
        ...blankStripePaymentFields(),
        paymentIntentId: "pi_fail_1",
      });
    });

    const result = await processVerifiedStripeEvent(failedEvent(orderId, "pi_fail_1"));
    expect(result.status).toBe("failed");
    expect(readPaymentsDb().orders.find((o) => o.id === orderId)?.status).toBe("failed");
    expect(readPaymentsDb().payments.find((p) => p.id === paymentId)?.status).toBe("failed");
  });

  it("ignores a duplicate Stripe event id", async () => {
    const event = failedEvent("missing", "pi_dup");
    const first = await processVerifiedStripeEvent(event);
    const second = await processVerifiedStripeEvent(event);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.status).toBe("duplicate");
  });

  it("ignores unrelated webhook types", async () => {
    const event = {
      id: `evt_${generateId().slice(0, 12)}`,
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_x" } },
      livemode: false,
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      pending_webhooks: 0,
      request: null,
    } as Stripe.Event;
    const result = await processVerifiedStripeEvent(event);
    expect(result.handled).toBe(false);
    expect(result.status).toBe("unhandled");
  });
});
