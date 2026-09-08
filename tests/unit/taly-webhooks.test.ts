/**
 * Taly webhooks — HMAC signature, duplicate ignore, approve, fail, refund.
 */

import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as talyWebhookPost } from "@/app/api/payments/taly/webhook/route";
import { generateId } from "@/lib/security/crypto";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { getAtplPackageProduct } from "@/services/payments/purchase-first-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { resetTalyTokenCache } from "@/services/payments/taly-client";
import { mapTalyOrderStatus } from "@/services/payments/taly-gateway";
import { computeTalySignature, talyCanonicalStrings } from "@/services/payments/taly-signature";
import { processTalyWebhook } from "@/services/payments/taly-webhook-service";

const ORIGINAL_ENV = { ...process.env };
const WEBHOOK_SECRET = "unit-test-taly-webhook-secret";

function signedPayload(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signature = computeTalySignature(payload, WEBHOOK_SECRET);
  return { body, signature };
}

function seedTalyOrder(email: string) {
  const product = getAtplPackageProduct()!;
  const stamp = new Date().toISOString();
  const orderId = generateId();
  const paymentId = generateId();
  const orderToken = `taly-${generateId().slice(0, 10)}`;
  const talyOrderId = String(Math.floor(Math.random() * 90_000) + 1000);
  writePaymentsDb((db) => {
    db.orders.unshift({
      id: orderId,
      orderNumber: `ORD-Y-${Date.now()}`,
      studentId: "guest",
      studentName: "Taly Guest",
      studentEmail: email,
      status: "pending",
      currency: product.currency,
      subtotalAmount: product.priceAmount,
      discountAmount: 0,
      taxAmount: 0,
      taxRatePercent: 0,
      totalAmount: product.priceAmount,
      couponId: null,
      couponCode: null,
      billingName: "Taly Guest",
      billingEmail: email,
      billingCountry: "KW",
      billingAddress: "Kuwait",
      items: [
        {
          id: generateId(),
          productId: product.id,
          productName: product.name,
          courseId: product.courseId,
          instructorId: product.instructorId,
          pricingModel: product.pricingModel,
          unitAmount: product.priceAmount,
          quantity: 1,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: product.priceAmount,
        },
      ],
      paymentId,
      invoiceId: null,
      idempotencyKey: `taly-wh-${orderId}`,
      failureReason: null,
      paidAt: null,
      cancelledAt: null,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      metadata: {
        purchaseFirst: true,
        guestFirstName: "Taly",
        guestLastName: "Guest",
        guestPhone: "+96555555333",
        guestCountry: "KW",
        paymentProvider: "taly",
      },
      createdAt: stamp,
      updatedAt: stamp,
    });
    db.payments.unshift({
      id: paymentId,
      orderId,
      provider: "taly",
      providerPaymentId: talyOrderId,
      status: "requires_payment",
      methodBrand: "taly",
      paymentMethodSummary: "Taly",
      amount: product.priceAmount,
      currency: product.currency,
      clientSecret: null,
      checkoutUrl: "https://www.dev-taly.io/checkout/securecheckout/test",
      webhookVerified: false,
      failureCode: null,
      failureMessage: null,
      rawProviderPayload: {
        talyOrderId,
        orderToken,
        merchantOrderId: orderId,
        purchaseFirst: true,
      },
      createdAt: stamp,
      updatedAt: stamp,
      ...blankStripePaymentFields(),
      checkoutSessionId: orderToken,
      country: "KW",
    });
  });
  return { orderId, paymentId, orderToken, talyOrderId };
}

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.TALY_API_KEY = "test-taly-api-key";
  process.env.TALY_SECRET_KEY = "test-taly-secret-key";
  process.env.TALY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.TALY_BASE_URL = "https://api.dev-taly.io";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  resetTalyTokenCache();
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  writePaymentsDb((db) => {
    db.processedProviderEvents = db.processedProviderEvents.filter((e) => e.provider !== "taly");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/uaa/oauth/token")) {
        return new Response(
          JSON.stringify({ access_token: "taly-access-token", expires_in: 3600 }),
          {
            status: 200,
          },
        );
      }
      return new Response(JSON.stringify({ orderStatus: "CONFIRMED" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTalyTokenCache();
  process.env = { ...ORIGINAL_ENV };
});

describe("Taly status mapping", () => {
  it("maps Approved, Pending, Failed, Cancelled, and Refunded", () => {
    expect(mapTalyOrderStatus("CONFIRMED")).toEqual({
      payment: "succeeded",
      order: "paid",
      action: "approve",
    });
    expect(mapTalyOrderStatus("Approved").order).toBe("paid");
    expect(mapTalyOrderStatus("INITIATED").action).toBe("pending");
    expect(mapTalyOrderStatus("Pending").action).toBe("pending");
    expect(mapTalyOrderStatus("REJECTED").action).toBe("fail");
    expect(mapTalyOrderStatus("Failed").order).toBe("failed");
    expect(mapTalyOrderStatus("CANCELLED").action).toBe("cancel");
    expect(mapTalyOrderStatus("Cancelled").order).toBe("cancelled");
    expect(mapTalyOrderStatus("REFUNDED").action).toBe("refund");
    expect(mapTalyOrderStatus("Refunded").order).toBe("refunded");
  });
});

describe("Taly webhook HMAC", () => {
  it("includes the documented concatenated example among canonical forms", () => {
    const payload = {
      amount: 2,
      orderToken: "34b97f38-4bd6-4880-9f0d-cf1edf0d86a4",
      currency: "KWD",
      orderStatus: "CONFIRMED",
      merchantOrderId: "5827585",
      orderDate: "2023-08-11T15:50:10.926457",
    };
    expect(talyCanonicalStrings(payload)).toContain(
      "2.000&34b97f38-4bd6-4880-9f0d-cf1edf0d86a4&KWD&CONFIRMED&5827585&2023-08-11T15:50:10.926457",
    );
    const signature = createHmac("sha256", WEBHOOK_SECRET)
      .update(
        "2.000&34b97f38-4bd6-4880-9f0d-cf1edf0d86a4&KWD&CONFIRMED&5827585&2023-08-11T15:50:10.926457",
        "utf8",
      )
      .digest("hex");
    expect(
      computeTalySignature(
        payload,
        WEBHOOK_SECRET,
        "2.000&34b97f38-4bd6-4880-9f0d-cf1edf0d86a4&KWD&CONFIRMED&5827585&2023-08-11T15:50:10.926457",
      ),
    ).toBe(signature);
  });
});

describe("Taly webhooks", () => {
  it("rejects an invalid signature when the webhook secret is set", async () => {
    await expect(
      processTalyWebhook(
        JSON.stringify({ orderToken: "x", orderStatus: "CONFIRMED", merchantOrderId: "y" }),
        "deadbeef",
      ),
    ).rejects.toThrow(/Invalid Taly webhook signature/);
  });

  it("approves payment, activates enrolment, and is idempotent on replay", async () => {
    const email = `taly.approved.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, orderToken } = seedTalyOrder(email);
    const { body, signature } = signedPayload({
      amount: 2,
      orderToken,
      currency: "KWD",
      orderStatus: "CONFIRMED",
      merchantOrderId: orderId,
      orderDate: "2026-09-08T12:00:00.000000",
    });

    const first = await processTalyWebhook(body, signature);
    expect(first.duplicate).toBe(false);
    expect(first.status).toBe("succeeded");
    expect(first.verified).toBe(true);

    const db = readPaymentsDb();
    const payment = db.payments.find((p) => p.id === paymentId)!;
    const order = db.orders.find((o) => o.id === orderId)!;
    expect(payment.status).toBe("succeeded");
    expect(payment.webhookVerified).toBe(true);
    expect(order.status).toBe("paid");
    expect(order.invoiceId).toBeTruthy();
    expect(findUserByEmail(email)).toBeTruthy();
    const user = findUserByEmail(email)!;
    expect(listStudentEnrollments(user.id).some((e) => e.status === "approved")).toBe(true);
    expect(readAuthDb().notifications.some((n) => n.userId === user.id)).toBe(true);

    const second = await processTalyWebhook(body, signature);
    expect(second.duplicate).toBe(true);
    expect(db.processedProviderEvents.filter((e) => e.id === first.eventId)).toHaveLength(1);
  });

  it("keeps enrolment pending on failed payment", async () => {
    const email = `taly.failed.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, orderToken } = seedTalyOrder(email);
    const { body, signature } = signedPayload({
      amount: 2,
      orderToken,
      currency: "KWD",
      orderStatus: "REJECTED",
      merchantOrderId: orderId,
      orderDate: "2026-09-08T12:01:00.000000",
    });
    const result = await processTalyWebhook(body, signature);
    expect(result.status).toBe("failed");
    const db = readPaymentsDb();
    expect(db.payments.find((p) => p.id === paymentId)?.status).toBe("failed");
    expect(db.orders.find((o) => o.id === orderId)?.status).toBe("failed");
    expect(findUserByEmail(email)).toBeNull();
  });

  it("records cancelled checkouts without creating an account", async () => {
    const email = `taly.cancel.${Date.now()}@aviatorpass.test`;
    const { orderId, orderToken } = seedTalyOrder(email);
    const { body, signature } = signedPayload({
      amount: 2,
      orderToken,
      currency: "KWD",
      orderStatus: "CANCELLED",
      merchantOrderId: orderId,
      orderDate: "2026-09-08T12:02:00.000000",
    });
    const result = await processTalyWebhook(body, signature);
    expect(result.status).toBe("failed");
    expect(readPaymentsDb().orders.find((o) => o.id === orderId)?.status).toBe("cancelled");
    expect(findUserByEmail(email)).toBeNull();
  });

  it("records refunds from Taly webhooks", async () => {
    const email = `taly.refund.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, orderToken } = seedTalyOrder(email);
    const approved = signedPayload({
      amount: 2,
      orderToken,
      currency: "KWD",
      orderStatus: "CONFIRMED",
      merchantOrderId: orderId,
      orderDate: "2026-09-08T12:03:00.000000",
    });
    await processTalyWebhook(approved.body, approved.signature);
    const refunded = signedPayload({
      amount: 2,
      orderToken,
      currency: "KWD",
      orderStatus: "REFUNDED",
      merchantOrderId: orderId,
      orderDate: "2026-09-08T12:04:00.000000",
    });
    const refund = await processTalyWebhook(refunded.body, refunded.signature);
    expect(refund.duplicate).toBe(false);
    const db = readPaymentsDb();
    expect(db.payments.find((p) => p.id === paymentId)?.status).toBe("refunded");
    expect(db.orders.find((o) => o.id === orderId)?.status).toBe("refunded");
    expect(db.refunds.some((r) => r.paymentId === paymentId && r.status === "processed")).toBe(
      true,
    );
  });

  it("exposes POST /api/payments/taly/webhook", async () => {
    const payload = {
      amount: 2,
      orderToken: `missing-${generateId().slice(0, 8)}`,
      currency: "KWD",
      orderStatus: "CONFIRMED",
      merchantOrderId: "missing-order",
      orderDate: "2026-09-08T12:05:00.000000",
    };
    const { body, signature } = signedPayload(payload);
    const res = await talyWebhookPost(
      new Request("https://www.aviatorpass.com/api/payments/taly/webhook", {
        method: "POST",
        headers: {
          "Taly-Signature": signature,
          "Content-Type": "application/json",
        },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { status: string } };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("ignored");
  });
});
