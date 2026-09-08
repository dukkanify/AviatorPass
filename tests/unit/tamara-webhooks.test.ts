/**
 * Tamara webhooks — signature, duplicate ignore, approve, fail, refund.
 */

import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as tamaraWebhookPost } from "@/app/api/payments/tamara/webhook/route";
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
import {
  mapTamaraEventToStatuses,
  processTamaraWebhook,
} from "@/services/payments/tamara-webhook-service";

const ORIGINAL_ENV = { ...process.env };
const NOTIFICATION_SECRET = "unit-test-tamara-notification-secret";

async function signedToken() {
  return new SignJWT({ iss: "Tamara" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(NOTIFICATION_SECRET));
}

function seedTamaraOrder(email: string) {
  const product = getAtplPackageProduct()!;
  const stamp = new Date().toISOString();
  const orderId = generateId();
  const paymentId = generateId();
  const tamaraOrderId = `tamara-${generateId().slice(0, 10)}`;
  writePaymentsDb((db) => {
    db.orders.unshift({
      id: orderId,
      orderNumber: `ORD-T-${Date.now()}`,
      studentId: "guest",
      studentName: "Tamara Guest",
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
      billingName: "Tamara Guest",
      billingEmail: email,
      billingCountry: "AE",
      billingAddress: "Dubai",
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
      idempotencyKey: `tamara-wh-${orderId}`,
      failureReason: null,
      paidAt: null,
      cancelledAt: null,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      metadata: {
        purchaseFirst: true,
        guestFirstName: "Tamara",
        guestLastName: "Guest",
        guestPhone: "+971501110000",
        guestCountry: "AE",
        paymentProvider: "tamara",
      },
      createdAt: stamp,
      updatedAt: stamp,
    });
    db.payments.unshift({
      id: paymentId,
      orderId,
      provider: "tamara",
      providerPaymentId: tamaraOrderId,
      status: "requires_payment",
      methodBrand: "tamara",
      paymentMethodSummary: "Tamara",
      amount: product.priceAmount,
      currency: product.currency,
      clientSecret: null,
      checkoutUrl: "https://checkout.tamara.co/checkout/test",
      webhookVerified: false,
      failureCode: null,
      failureMessage: null,
      rawProviderPayload: { orderId: tamaraOrderId, purchaseFirst: true },
      createdAt: stamp,
      updatedAt: stamp,
      ...blankStripePaymentFields(),
      checkoutSessionId: tamaraOrderId,
      country: "AE",
    });
  });
  return { orderId, paymentId, tamaraOrderId };
}

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.TAMARA_API_TOKEN = "test-tamara-api-token";
  process.env.TAMARA_BASE_URL = "https://api-sandbox.tamara.co";
  process.env.TAMARA_NOTIFICATION_TOKEN = NOTIFICATION_SECRET;
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
  writePaymentsDb((db) => {
    db.processedProviderEvents = db.processedProviderEvents.filter((e) => e.provider !== "tamara");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ status: "authorised" }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("Tamara status mapping", () => {
  it("maps Approved, Authorised, OnHold, Declined, and Cancelled", () => {
    expect(mapTamaraEventToStatuses("order_approved").action).toBe("approve");
    expect(mapTamaraEventToStatuses("Approved").order).toBe("paid");
    expect(mapTamaraEventToStatuses("order_authorised").action).toBe("pending");
    expect(mapTamaraEventToStatuses("OnHold").action).toBe("pending");
    expect(mapTamaraEventToStatuses("order_declined").action).toBe("fail");
    expect(mapTamaraEventToStatuses("Cancelled").action).toBe("cancel");
    expect(mapTamaraEventToStatuses("order_refunded").action).toBe("refund");
  });
});

describe("Tamara webhooks", () => {
  it("rejects an invalid signature when the notification token is set", async () => {
    await expect(
      processTamaraWebhook(
        JSON.stringify({ order_id: "x", event_type: "order_approved" }),
        "not-a-jwt",
      ),
    ).rejects.toThrow(/Invalid Tamara webhook signature/);
  });

  it("approves payment, activates enrolment, and is idempotent on replay", async () => {
    const email = `tamara.approved.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, tamaraOrderId } = seedTamaraOrder(email);
    const token = await signedToken();
    const payload = JSON.stringify({
      order_id: tamaraOrderId,
      order_reference_id: orderId,
      event_type: "order_approved",
    });

    const first = await processTamaraWebhook(payload, token);
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

    const second = await processTamaraWebhook(payload, token);
    expect(second.duplicate).toBe(true);
    expect(db.processedProviderEvents.filter((e) => e.id === first.eventId)).toHaveLength(1);
  });

  it("keeps enrolment pending on declined payment", async () => {
    const email = `tamara.declined.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, tamaraOrderId } = seedTamaraOrder(email);
    const token = await signedToken();
    const result = await processTamaraWebhook(
      JSON.stringify({
        order_id: tamaraOrderId,
        order_reference_id: orderId,
        event_type: "order_declined",
      }),
      token,
    );
    expect(result.status).toBe("failed");
    const db = readPaymentsDb();
    expect(db.payments.find((p) => p.id === paymentId)?.status).toBe("failed");
    expect(db.orders.find((o) => o.id === orderId)?.status).toBe("failed");
    expect(findUserByEmail(email)).toBeNull();
  });

  it("records refunds from Tamara webhooks", async () => {
    const email = `tamara.refund.${Date.now()}@aviatorpass.test`;
    const { orderId, paymentId, tamaraOrderId } = seedTamaraOrder(email);
    const token = await signedToken();
    await processTamaraWebhook(
      JSON.stringify({
        order_id: tamaraOrderId,
        order_reference_id: orderId,
        event_type: "order_approved",
      }),
      token,
    );
    const refund = await processTamaraWebhook(
      JSON.stringify({
        order_id: tamaraOrderId,
        order_reference_id: orderId,
        event_type: "order_refunded",
      }),
      token,
    );
    expect(refund.duplicate).toBe(false);
    const db = readPaymentsDb();
    expect(db.payments.find((p) => p.id === paymentId)?.status).toBe("refunded");
    expect(db.orders.find((o) => o.id === orderId)?.status).toBe("refunded");
    expect(db.refunds.some((r) => r.paymentId === paymentId && r.status === "processed")).toBe(
      true,
    );
  });

  it("exposes POST /api/payments/tamara/webhook", async () => {
    const token = await signedToken();
    const res = await tamaraWebhookPost(
      new Request("https://www.aviatorpass.com/api/payments/tamara/webhook", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: `missing-${generateId().slice(0, 8)}`,
          event_type: "order_approved",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { status: string } };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("ignored");
  });
});
