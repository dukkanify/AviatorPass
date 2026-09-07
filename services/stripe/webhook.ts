/**
 * Stripe webhook verify + dispatch.
 * Signature is required. Events are processed idempotently.
 */

import type Stripe from "stripe";

import { PaymentError } from "@/services/payments/access";
import { getOrder } from "@/services/payments/checkout-service";
import { handleStripeWebhook } from "@/services/payments/stripe-webhook-service";
import { writePaymentsDb } from "@/services/payments/store";
import { constructStripeEvent } from "@/services/stripe/client";
import {
  activatePaidEnrollment,
  notifyPaymentFailed,
  notifyPaymentSucceeded,
  patchCheckoutStatus,
} from "@/services/stripe/fulfillment";
import { logStripeEvent } from "@/services/stripe/logging";
import {
  findCheckoutByOrderId,
  findCheckoutByPaymentIntentId,
  findCheckoutBySessionId,
} from "@/services/stripe/store";
import type { StripeWebhookProcessResult } from "@/services/stripe/types";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function processStripeWebhook(
  payload: string,
  signature: string | null,
): Promise<StripeWebhookProcessResult> {
  let event: Stripe.Event;
  try {
    event = constructStripeEvent(payload, signature);
  } catch (error) {
    logStripeEvent({
      level: "error",
      message: "Webhook signature verification failed",
      details: { reason: error instanceof Error ? error.message : "invalid_signature" },
    });
    throw error;
  }

  logStripeEvent({
    message: `Received ${event.type}`,
    details: { eventId: event.id, type: event.type, livemode: event.livemode },
  });

  const existing = await handleStripeWebhook(payload, signature);
  const object = event.data.object as {
    id?: string;
    object?: string;
    metadata?: Record<string, string> | null;
  };
  const stored =
    (object.object === "checkout.session" && object.id
      ? findCheckoutBySessionId(object.id)
      : null) ||
    (object.object === "payment_intent" && object.id
      ? findCheckoutByPaymentIntentId(object.id)
      : null) ||
    (str(object.metadata?.orderId) ? findCheckoutByOrderId(str(object.metadata?.orderId)!) : null);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paid = session.payment_status === "paid" || session.status === "complete";
      const meta = session.metadata ?? {};
      const courseId = stored?.courseId || meta.courseId || "";
      const studentId = stored?.studentId || meta.studentId || "";
      if (paid) {
        const enrollment = await activatePaidEnrollment({
          courseId,
          studentId,
          actorId: studentId || null,
        });
        patchCheckoutStatus(session.id, {
          status: "paid",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (stored?.stripePaymentIntentId ?? null),
          stripeCustomerId:
            typeof session.customer === "string"
              ? session.customer
              : (stored?.stripeCustomerId ?? null),
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : (stored?.stripeSubscriptionId ?? null),
          enrollmentId: enrollment?.id ?? stored?.enrollmentId ?? null,
        });
        if (stored?.status !== "paid") {
          await notifyPaymentSucceeded({
            studentId,
            courseId,
            amount: session.amount_total ?? stored?.amount ?? 0,
            currency: (session.currency ?? stored?.currency ?? "usd").toUpperCase(),
            reference: session.id,
          });
        }
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = str(pi.metadata?.orderId) ?? stored?.orderId;
      if (orderId) {
        writePaymentsDb((db) => {
          const order = db.orders.find((row) => row.id === orderId);
          if (!order || order.status === "paid") return;
          order.status = "pending";
          order.failureReason = pi.last_payment_error?.message ?? "Payment failed";
          order.updatedAt = new Date().toISOString();
        });
      }
      if (stored) {
        patchCheckoutStatus(stored.stripeSessionId, {
          status: "failed",
          failureMessage: pi.last_payment_error?.message ?? "Payment failed",
        });
        await notifyPaymentFailed({
          studentId: stored.studentId,
          courseId: stored.courseId,
          amount: stored.amount,
          currency: stored.currency,
          reference: stored.stripeSessionId,
          message: pi.last_payment_error?.message,
        });
      }
    }

    if (event.type === "charge.refunded") {
      if (stored) {
        patchCheckoutStatus(stored.stripeSessionId, { status: "refunded" });
      }
    }
  } catch (error) {
    logStripeEvent({
      level: "error",
      message: "Post-webhook fulfilment failed",
      details: {
        eventId: event.id,
        type: event.type,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
    throw error instanceof PaymentError
      ? error
      : new PaymentError("Webhook fulfilment failed", 500);
  }

  const order = existing.orderId ? getOrder(existing.orderId) : null;
  return {
    eventId: existing.eventId,
    type: existing.type,
    duplicate: existing.duplicate,
    handled: existing.handled,
    status: stored?.status ?? existing.status,
    checkoutId: stored?.id ?? null,
    paymentId: existing.paymentId,
    orderId: existing.orderId ?? order?.id ?? null,
  };
}
