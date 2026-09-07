/**
 * Public Checkout Session lookup — no secrets, no client_secret.
 */

import { PaymentError } from "@/services/payments/access";
import { getStripeClient, isStripeConfigured } from "@/services/stripe/client";
import { findCheckoutBySessionId } from "@/services/stripe/store";
import type { PublicCheckoutSession, StripeLifecycleStatus } from "@/services/stripe/types";

function fromStripePaymentStatus(status: string | null | undefined): StripeLifecycleStatus {
  if (status === "paid") return "paid";
  if (status === "unpaid") return "pending";
  if (status === "no_payment_required") return "paid";
  return "pending";
}

export async function getPublicCheckoutSession(sessionId: string): Promise<PublicCheckoutSession> {
  const id = sessionId.trim();
  if (!id || !id.startsWith("cs_")) {
    throw new PaymentError("A Stripe Checkout session_id is required", 400);
  }

  const stored = findCheckoutBySessionId(id);
  if (stored) {
    return {
      sessionId: stored.stripeSessionId,
      status: stored.status,
      paymentStatus: stored.status,
      courseId: stored.courseId,
      studentId: stored.studentId,
      instructorId: stored.instructorId,
      currency: stored.currency,
      amount: stored.amount,
      paid: stored.status === "paid",
      enrollmentPending: stored.status === "pending" || stored.status === "failed",
      successUrl: stored.successUrl,
      cancelUrl: stored.cancelUrl,
    };
  }

  if (!isStripeConfigured()) {
    throw new PaymentError("Checkout session not found", 404);
  }

  try {
    const session = await getStripeClient().checkout.sessions.retrieve(id);
    const status = fromStripePaymentStatus(session.payment_status);
    const meta = session.metadata ?? {};
    return {
      sessionId: session.id,
      status,
      paymentStatus: session.payment_status,
      courseId: meta.courseId ?? "",
      studentId: meta.studentId ?? "",
      instructorId: meta.instructorId ?? "",
      currency: (session.currency ?? meta.currency ?? "usd").toUpperCase(),
      amount: session.amount_total ?? Number(meta.amount ?? 0),
      paid: session.payment_status === "paid",
      enrollmentPending: session.payment_status !== "paid",
      successUrl: session.success_url ?? "",
      cancelUrl: session.cancel_url ?? "",
    };
  } catch {
    throw new PaymentError("Checkout session not found", 404);
  }
}
