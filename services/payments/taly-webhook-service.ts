/**
 * Taly webhook processor — HMAC verified with TALY_WEBHOOK_SECRET, retry-safe,
 * idempotent by orderToken + orderStatus (+ orderDate when present).
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId } from "@/lib/security/crypto";
import { logActivity, logAudit } from "@/services/auth/activity-log";
import { PaymentError } from "@/services/payments/access";
import { completePaidOrder, getOrder, getPayment } from "@/services/payments/checkout-service";
import { formatMinor } from "@/services/payments/money";
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
import { getTalyOrder } from "@/services/payments/taly-client";
import { getTalyWebhookSecret, isTalyConfigured } from "@/services/payments/taly-config";
import { mapTalyOrderStatus } from "@/services/payments/taly-gateway";
import { logTalyEvent } from "@/services/payments/taly-logging";
import { verifyTalyWebhookSignature } from "@/services/payments/taly-signature";
import { shouldRevokeAccessOnRefund } from "@/services/stripe/config";
import type { PaymentRecord } from "@/types/payments";

export type TalyWebhookResult = {
  eventId: string;
  type: string;
  duplicate: boolean;
  handled: boolean;
  paymentId: string | null;
  orderId: string | null;
  status: string;
  verified: boolean;
};

export type TalyWebhookPayload = {
  amount?: number | string;
  orderToken?: string;
  currency?: string;
  orderStatus?: string;
  merchantOrderId?: string;
  orderDate?: string;
  talyOrderId?: number | string;
};

function nowIso() {
  return new Date().toISOString();
}

export function talyEventId(payload: TalyWebhookPayload): string {
  const token = payload.orderToken?.trim() || payload.merchantOrderId?.trim() || "unknown";
  const status = (payload.orderStatus ?? "unknown").trim().toUpperCase() || "UNKNOWN";
  const date = payload.orderDate?.trim() || "";
  return date ? `${token}:${status}:${date}` : `${token}:${status}`;
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
      provider: "taly",
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

function findTalyPayment(payload: TalyWebhookPayload): PaymentRecord | null {
  const { payments, orders } = readPaymentsDb();
  if (payload.orderToken) {
    const byToken = payments.find(
      (p) =>
        p.provider === "taly" &&
        (p.checkoutSessionId === payload.orderToken ||
          p.providerPaymentId === payload.orderToken ||
          String(p.rawProviderPayload.orderToken ?? "") === payload.orderToken),
    );
    if (byToken) return byToken;
  }
  if (payload.talyOrderId != null) {
    const id = String(payload.talyOrderId);
    const byTalyId = payments.find(
      (p) =>
        p.provider === "taly" &&
        (p.providerPaymentId === id || String(p.rawProviderPayload.talyOrderId ?? "") === id),
    );
    if (byTalyId) return byTalyId;
  }
  if (payload.merchantOrderId) {
    const byRef = payments.find((p) => p.orderId === payload.merchantOrderId);
    if (byRef) return byRef;
    const order = orders.find(
      (o) => o.id === payload.merchantOrderId || o.orderNumber === payload.merchantOrderId,
    );
    if (order) {
      return payments.find((p) => p.orderId === order.id || p.id === order.paymentId) ?? null;
    }
  }
  return null;
}

function storeWebhookPayload(
  paymentId: string | null,
  payload: TalyWebhookPayload,
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

export function verifyTalyWebhookSecret(payloadText: string, signature: string | null): boolean {
  const secret = getTalyWebhookSecret();
  if (!secret) {
    throw new PaymentError("Taly webhook secret is not configured", 503);
  }
  if (!signature) {
    throw new PaymentError("Taly webhook signature missing", 401);
  }
  if (!verifyTalyWebhookSignature(payloadText, signature, secret)) {
    throw new PaymentError("Invalid Taly webhook signature", 401);
  }
  return true;
}

async function verifyRemoteStatus(payment: PaymentRecord, expected: string): Promise<void> {
  if (!isTalyConfigured()) return;
  try {
    const remote = await getTalyOrder(payment.orderId);
    const remoteStatus = String(remote.orderStatus ?? "").toUpperCase();
    if (remoteStatus && remoteStatus !== expected.toUpperCase()) {
      logTalyEvent({
        level: "warn",
        message: "Remote order status differs from webhook",
        details: {
          paymentId: payment.id,
          webhookStatus: expected,
          remoteStatus,
        },
      });
    }
  } catch (error) {
    logTalyEvent({
      level: "warn",
      message: "Payment verification lookup skipped",
      details: {
        paymentId: payment.id,
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
  logTalyEvent({
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
      p.failureCode = cancelled ? "cancelled" : "failed";
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
        ? "Your Taly checkout was cancelled. Enrolment stays pending until you retry."
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
    metadata: { provider: "taly", cancelled, createdAccount: false },
  });
  logTalyEvent({
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
        reason: "Taly order refunded",
        status: "processed",
        adminNotes: "Applied from Taly webhook",
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
      description: `Taly refund for ${o?.orderNumber ?? payment.orderId}`,
      metadata: { provider: "taly", partial },
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
    action: "payments.taly_refunded",
    resource: `payment:${payment.id}`,
    afterState: { partial, provider: "taly" },
  });
  logTalyEvent({
    message: "Refund",
    details: { paymentId: payment.id, orderId: payment.orderId, partial },
  });
}

export async function processTalyWebhook(
  payloadText: string,
  signature: string | null,
): Promise<TalyWebhookResult> {
  logTalyEvent({
    message: "Webhook received",
    details: { hasSignature: Boolean(signature), bytes: payloadText.length },
  });

  let payload: TalyWebhookPayload;
  try {
    payload = JSON.parse(payloadText) as TalyWebhookPayload;
  } catch {
    throw new PaymentError("Invalid Taly webhook payload", 400);
  }

  const verified = verifyTalyWebhookSecret(payloadText, signature);
  const type = (payload.orderStatus ?? "unknown").trim().toUpperCase() || "UNKNOWN";
  logTalyEvent({
    message: "Webhook verified",
    details: {
      orderStatus: type,
      merchantOrderId: payload.merchantOrderId ?? null,
    },
  });

  const eventId = talyEventId(payload);
  if (alreadyProcessed(eventId)) {
    logTalyEvent({
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

  const mapping = mapTalyOrderStatus(type);
  const payment = findTalyPayment(payload);
  storeWebhookPayload(payment?.id ?? null, payload, eventId);

  if (!payment) {
    markProcessed({
      eventId,
      type,
      paymentId: null,
      orderId: payload.merchantOrderId ?? null,
      result: "ignored",
    });
    return {
      eventId,
      type,
      duplicate: false,
      handled: false,
      paymentId: null,
      orderId: payload.merchantOrderId ?? null,
      status: "ignored",
      verified,
    };
  }

  let status = mapping.payment === "cancelled" ? "failed" : mapping.payment;
  if (mapping.action === "approve") {
    const order = getOrder(payment.orderId);
    if (order?.status === "paid" && payment.status === "succeeded") {
      status = "succeeded";
    } else {
      await verifyRemoteStatus(payment, type);
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
    await markFailed(payment, "Taly declined the payment.", false);
  } else if (mapping.action === "cancel") {
    await markFailed(payment, "Taly checkout was cancelled.", true);
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
