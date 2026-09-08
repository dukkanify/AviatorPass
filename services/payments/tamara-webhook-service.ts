/**
 * Tamara webhook processor — signature verified when a notification token is set,
 * retry-safe, idempotent by order_id + event_type.
 */

import { jwtVerify } from "jose";

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId } from "@/lib/security/crypto";
import { logActivity, logAudit } from "@/services/auth/activity-log";
import { PaymentError } from "@/services/payments/access";
import { completePaidOrder, getOrder, getPayment } from "@/services/payments/checkout-service";
import { formatMinor, formatTamaraAmount } from "@/services/payments/money";
import { notifyPayment } from "@/services/payments/notify";
import {
  GUEST_STUDENT_ID,
  fulfillGuestPaidOrder,
} from "@/services/payments/purchase-first-service";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import { clawbackForRefund } from "@/services/payments/wallet-service";
import {
  listStudentEnrollments,
  updateEnrollmentStatus,
} from "@/services/courses/enrollment-service";
import { authoriseTamaraOrder, captureTamaraOrder } from "@/services/payments/tamara-client";
import { getTamaraNotificationToken } from "@/services/payments/tamara-config";
import { logTamaraEvent } from "@/services/payments/tamara-logging";
import { shouldRevokeAccessOnRefund } from "@/services/stripe/config";
import type { Order, PaymentRecord, PaymentStatus } from "@/types/payments";

export type TamaraWebhookResult = {
  eventId: string;
  type: string;
  duplicate: boolean;
  handled: boolean;
  paymentId: string | null;
  orderId: string | null;
  status: string;
  verified: boolean;
};

type TamaraWebhookPayload = {
  order_id?: string;
  order_reference_id?: string;
  order_number?: string;
  event_type?: string;
  data?: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

export function extractTamaraToken(request: { headers: Headers; url: string }): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("tamaraToken")?.trim();
    if (query) return query;
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeTamaraEventType(raw: string | undefined | null): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function mapTamaraEventToStatuses(eventType: string): {
  payment: PaymentStatus | "cancelled";
  order: Order["status"] | null;
  action: "approve" | "pending" | "fail" | "cancel" | "refund" | "ignore";
} {
  const type = normalizeTamaraEventType(eventType);
  if (type === "order_approved" || type === "approved") {
    return { payment: "succeeded", order: "paid", action: "approve" };
  }
  if (
    type === "order_authorised" ||
    type === "order_authorized" ||
    type === "authorised" ||
    type === "authorized" ||
    type === "order_onhold" ||
    type === "order_on_hold" ||
    type === "onhold" ||
    type === "on_hold"
  ) {
    return { payment: "processing", order: "pending", action: "pending" };
  }
  if (type === "order_declined" || type === "declined") {
    return { payment: "failed", order: "failed", action: "fail" };
  }
  if (
    type === "order_canceled" ||
    type === "order_cancelled" ||
    type === "cancelled" ||
    type === "canceled"
  ) {
    return { payment: "failed", order: "cancelled", action: "cancel" };
  }
  if (
    type === "order_refunded" ||
    type === "order_fully_refunded" ||
    type === "order_partially_refunded" ||
    type === "refunded" ||
    type === "partially_refunded"
  ) {
    return {
      payment: type.includes("partial") ? "partially_refunded" : "refunded",
      order: type.includes("partial") ? null : "refunded",
      action: "refund",
    };
  }
  return { payment: "processing", order: null, action: "ignore" };
}

export function tamaraEventId(payload: TamaraWebhookPayload): string {
  const orderId = payload.order_id?.trim() || "unknown";
  const type = normalizeTamaraEventType(payload.event_type) || "unknown";
  return `${orderId}:${type}`;
}

function alreadyProcessed(eventId: string): boolean {
  return readPaymentsDb().processedProviderEvents.some((e) => e.id === eventId);
}

function markProcessed(input: {
  eventId: string;
  type: string;
  paymentId: string | null;
  orderId: string | null;
  result: string;
}) {
  writePaymentsDb((db) => {
    if (db.processedProviderEvents.some((e) => e.id === input.eventId)) return;
    db.processedProviderEvents.unshift({
      id: input.eventId,
      provider: "tamara",
      type: input.type,
      processedAt: nowIso(),
      paymentId: input.paymentId,
      orderId: input.orderId,
      result: input.result,
    });
    if (db.processedProviderEvents.length > 5000) {
      db.processedProviderEvents = db.processedProviderEvents.slice(0, 5000);
    }
  });
}

function findTamaraPayment(payload: TamaraWebhookPayload): PaymentRecord | null {
  const payments = readPaymentsDb().payments;
  const orders = readPaymentsDb().orders;
  if (payload.order_id) {
    const byProvider = payments.find(
      (p) =>
        p.providerPaymentId === payload.order_id ||
        p.checkoutSessionId === payload.order_id ||
        String(p.rawProviderPayload.orderId ?? "") === payload.order_id,
    );
    if (byProvider) return byProvider;
  }
  if (payload.order_reference_id) {
    const byRef = payments.find((p) => p.orderId === payload.order_reference_id);
    if (byRef) return byRef;
    const order = orders.find(
      (o) => o.id === payload.order_reference_id || o.orderNumber === payload.order_number,
    );
    if (order) {
      return payments.find((p) => p.orderId === order.id || p.id === order.paymentId) ?? null;
    }
  }
  return null;
}

function storeWebhookPayload(
  paymentId: string | null,
  payload: TamaraWebhookPayload,
  eventId: string,
) {
  if (!paymentId) return;
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === paymentId);
    if (!p) return;
    const existing = Array.isArray(p.rawProviderPayload.webhooks)
      ? (p.rawProviderPayload.webhooks as unknown[])
      : [];
    p.rawProviderPayload = {
      ...p.rawProviderPayload,
      lastWebhook: payload as Record<string, unknown>,
      lastWebhookId: eventId,
      webhooks: [...existing, { eventId, receivedAt: nowIso(), payload }].slice(-25),
    };
    p.updatedAt = nowIso();
  });
}

export async function verifyTamaraNotificationToken(token: string | null): Promise<boolean> {
  const secret = getTamaraNotificationToken();
  if (secret) {
    if (!token) {
      throw new PaymentError("Tamara webhook signature missing", 401);
    }
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return true;
    } catch {
      throw new PaymentError("Invalid Tamara webhook signature", 401);
    }
  }
  if (token && isProductionRuntime()) {
    throw new PaymentError("Tamara notification token is not configured", 401);
  }
  return false;
}

async function authoriseAndCapture(payment: PaymentRecord) {
  const tamaraOrderId = payment.providerPaymentId;
  if (!tamaraOrderId) return;
  try {
    const authorised = await authoriseTamaraOrder(tamaraOrderId);
    logTamaraEvent({
      message: "Order authorised",
      details: { paymentId: payment.id, tamaraOrderId, status: String(authorised.status ?? "") },
    });
  } catch (error) {
    logTamaraEvent({
      level: "warn",
      message: "Authorise skipped or failed",
      details: {
        paymentId: payment.id,
        tamaraOrderId,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
  }
  try {
    await captureTamaraOrder({
      orderId: tamaraOrderId,
      amount: {
        amount: formatTamaraAmount(payment.amount, payment.currency),
        currency: payment.currency.toUpperCase(),
      },
    });
    logTamaraEvent({
      message: "Payment captured",
      details: { paymentId: payment.id, tamaraOrderId },
    });
  } catch (error) {
    logTamaraEvent({
      level: "warn",
      message: "Capture skipped or failed",
      details: {
        paymentId: payment.id,
        tamaraOrderId,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
  }
}

async function fulfillPaid(payment: PaymentRecord) {
  const stamp = nowIso();
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === payment.id);
    if (p) {
      p.status = "succeeded";
      p.webhookVerified = true;
      p.updatedAt = stamp;
    }
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (o && o.status !== "paid") {
      o.status = "paid";
      o.paidAt = stamp;
      o.failureReason = null;
      o.updatedAt = stamp;
    }
  });
  const paidOrder = getOrder(payment.orderId);
  const paidPayment = getPayment(payment.id);
  if (!paidOrder || !paidPayment) return;
  if (paidOrder.metadata?.purchaseFirst) {
    await fulfillGuestPaidOrder(paidOrder, paidPayment);
  } else if (paidOrder.studentId && paidOrder.studentId !== GUEST_STUDENT_ID) {
    await completePaidOrder(paidOrder, paidPayment, paidOrder.studentId);
  }
  logTamaraEvent({
    message: "Payment approved",
    details: { paymentId: payment.id, orderId: paidOrder.id },
  });
}

async function markFailed(payment: PaymentRecord, message: string, cancelled: boolean) {
  const stamp = nowIso();
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === payment.id);
    if (p) {
      p.status = "failed";
      p.webhookVerified = true;
      p.failureCode = cancelled ? "cancelled" : "declined";
      p.failureMessage = message;
      p.updatedAt = stamp;
    }
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (o && o.status !== "paid") {
      o.status = cancelled ? "cancelled" : "failed";
      o.failureReason = message;
      o.updatedAt = stamp;
      if (cancelled) o.cancelledAt = stamp;
    }
  });
  const order = getOrder(payment.orderId);
  if (order?.studentId && order.studentId !== GUEST_STUDENT_ID) {
    await notifyPayment(order.studentId, {
      title: cancelled ? "Payment cancelled" : "Payment unsuccessful",
      body: cancelled
        ? "Your Tamara checkout was cancelled. Enrolment stays pending until you retry."
        : `${message} Your enrolment stays pending until you retry checkout.`,
      type: "payment.failed",
      reference: order.orderNumber,
      actionUrl: "/checkout",
      email: true,
    });
  }
  await logActivity({
    actorId: null,
    action: ACTIVITY_ACTIONS.PAYMENT_FAILED,
    entityType: "payment",
    entityId: payment.id,
    metadata: { provider: "tamara", cancelled, createdAccount: false },
  });
  logTamaraEvent({
    level: "warn",
    message: cancelled ? "Payment cancelled" : "Payment failed",
    details: { paymentId: payment.id, orderId: payment.orderId },
  });
}

async function markRefunded(payment: PaymentRecord, partial: boolean) {
  const stamp = nowIso();
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === payment.id);
    if (p) {
      p.status = partial ? "partially_refunded" : "refunded";
      p.webhookVerified = true;
      p.updatedAt = stamp;
    }
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (o && !partial) {
      o.status = "refunded";
      o.updatedAt = stamp;
    }
    const existing = db.refunds.find((r) => r.paymentId === payment.id && r.status === "processed");
    if (!existing) {
      db.refunds.unshift({
        id: generateId(),
        refundNumber: `REF-${new Date().getFullYear()}-${String(db.refunds.length + 1).padStart(4, "0")}`,
        orderId: payment.orderId,
        paymentId: payment.id,
        studentId: o && o.studentId !== GUEST_STUDENT_ID ? o.studentId : payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        isPartial: partial,
        reason: "Tamara order refunded",
        status: "processed",
        adminNotes: "Applied from Tamara webhook",
        reviewedById: null,
        processedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    db.transactionLogs.unshift({
      id: generateId(),
      kind: "refund",
      referenceId: payment.id,
      actorId: null,
      studentId: o && o.studentId !== GUEST_STUDENT_ID ? o.studentId : null,
      instructorId: o?.items[0]?.instructorId ?? null,
      amount: payment.amount,
      currency: payment.currency,
      description: `Tamara refund for ${o?.orderNumber ?? payment.orderId}`,
      metadata: { provider: "tamara", partial },
      createdAt: stamp,
    });
  });

  const order = getOrder(payment.orderId);
  if (order) {
    for (const item of order.items) {
      if (item.instructorId) {
        clawbackForRefund(item.instructorId, item.totalAmount || payment.amount, order.id);
      }
    }
    if (order.studentId && order.studentId !== GUEST_STUDENT_ID) {
      await notifyPayment(order.studentId, {
        title: partial ? "Partial refund processed" : "Refund processed",
        body: `${formatMinor(payment.amount, payment.currency)} was refunded for ${order.orderNumber}.`,
        type: "refund.approved",
        reference: order.orderNumber,
        amountLabel: formatMinor(payment.amount, payment.currency),
      });
    }
    const revoke =
      shouldRevokeAccessOnRefund() || Boolean(readPaymentsDb().settings.revokeAccessOnRefund);
    if (!partial && revoke && order.studentId && order.studentId !== GUEST_STUDENT_ID) {
      for (const item of order.items) {
        if (!item.courseId) continue;
        const enrollment = listStudentEnrollments(order.studentId).find(
          (row) => row.courseId === item.courseId && row.status === "approved",
        );
        if (enrollment) {
          await updateEnrollmentStatus({
            id: enrollment.id,
            status: "suspended",
            actorId: null,
          });
        }
      }
    }
  }
  await logAudit({
    actorId: null,
    action: "payments.tamara_refunded",
    resource: `payment:${payment.id}`,
    afterState: { partial, provider: "tamara" },
  });
  logTamaraEvent({
    message: "Refund",
    details: { paymentId: payment.id, orderId: payment.orderId, partial },
  });
}

export async function processTamaraWebhook(
  payloadText: string,
  tamaraToken: string | null,
): Promise<TamaraWebhookResult> {
  logTamaraEvent({
    message: "Webhook received",
    details: { hasSignature: Boolean(tamaraToken), bytes: payloadText.length },
  });

  let payload: TamaraWebhookPayload;
  try {
    payload = JSON.parse(payloadText) as TamaraWebhookPayload;
  } catch {
    throw new PaymentError("Invalid Tamara webhook payload", 400);
  }

  const verified = await verifyTamaraNotificationToken(tamaraToken);
  logTamaraEvent({
    message: verified ? "Webhook verified" : "Webhook unverified",
    level: verified ? "info" : "warn",
    details: {
      eventType: payload.event_type ?? null,
      orderId: payload.order_id ?? null,
    },
  });

  const type = normalizeTamaraEventType(payload.event_type) || "unknown";
  const eventId = tamaraEventId(payload);
  if (alreadyProcessed(eventId)) {
    logTamaraEvent({
      message: "Duplicate webhook ignored",
      details: { eventId, type },
    });
    return {
      eventId,
      type,
      duplicate: true,
      handled: true,
      paymentId: null,
      orderId: null,
      status: "duplicate",
      verified,
    };
  }

  const mapping = mapTamaraEventToStatuses(type);
  const payment = findTamaraPayment(payload);
  storeWebhookPayload(payment?.id ?? null, payload, eventId);

  if (!payment) {
    markProcessed({
      eventId,
      type,
      paymentId: null,
      orderId: payload.order_reference_id ?? null,
      result: "ignored",
    });
    return {
      eventId,
      type,
      duplicate: false,
      handled: false,
      paymentId: null,
      orderId: payload.order_reference_id ?? null,
      status: "ignored",
      verified,
    };
  }

  let status = mapping.payment;
  if (mapping.action === "approve") {
    const order = getOrder(payment.orderId);
    if (order?.status === "paid" && payment.status === "succeeded") {
      status = "succeeded";
    } else {
      await authoriseAndCapture(payment);
      await fulfillPaid(payment);
      status = "succeeded";
    }
  } else if (mapping.action === "pending") {
    const order = getOrder(payment.orderId);
    if (order?.status !== "paid") {
      writePaymentsDb((db) => {
        const p = db.payments.find((x) => x.id === payment.id);
        if (p && p.status !== "succeeded") {
          p.status = "processing";
          p.webhookVerified = true;
          p.updatedAt = nowIso();
        }
      });
    }
  } else if (mapping.action === "fail") {
    await markFailed(payment, "Tamara declined the payment.", false);
  } else if (mapping.action === "cancel") {
    await markFailed(payment, "Tamara checkout was cancelled.", true);
  } else if (mapping.action === "refund") {
    await markRefunded(payment, mapping.payment === "partially_refunded");
  }

  const fresh = getPayment(payment.id);
  markProcessed({
    eventId,
    type,
    paymentId: payment.id,
    orderId: payment.orderId,
    result: status,
  });

  return {
    eventId,
    type,
    duplicate: false,
    handled: mapping.action !== "ignore",
    paymentId: payment.id,
    orderId: payment.orderId,
    status: fresh?.status ?? status,
    verified,
  };
}
