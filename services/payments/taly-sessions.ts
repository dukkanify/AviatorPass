/**
 * Public Taly / order session lookup — no secrets.
 */

import { PaymentError } from "@/services/payments/access";
import { getOrder, getPayment, listPayments } from "@/services/payments/checkout-service";
import { routes } from "@/constants/routes";
import { publicAppOrigin } from "@/lib/site-origin";
import type { PublicCheckoutSession, StripeLifecycleStatus } from "@/services/stripe/types";

const GUEST_STUDENT_ID = "guest";

function fromOrderStatus(status: string): StripeLifecycleStatus {
  if (status === "paid") return "paid";
  if (status === "failed" || status === "cancelled" || status === "expired") return "failed";
  if (status === "refunded") return "refunded";
  return "pending";
}

export function getPublicTalySession(sessionId: string): PublicCheckoutSession {
  const id = sessionId.trim();
  if (!id) {
    throw new PaymentError("A checkout session_id is required", 400);
  }

  const payments = listPayments();
  const payment =
    payments.find(
      (p) =>
        p.provider === "taly" &&
        (p.providerPaymentId === id ||
          p.checkoutSessionId === id ||
          p.orderId === id ||
          String(p.rawProviderPayload.orderToken ?? "") === id ||
          String(p.rawProviderPayload.talyOrderId ?? "") === id ||
          String(p.rawProviderPayload.merchantOrderId ?? "") === id),
    ) ?? payments.find((p) => p.orderId === id || p.id === id);

  const order = payment ? getOrder(payment.orderId) : getOrder(id);
  if (!order && !payment) {
    throw new PaymentError("Checkout session not found", 404);
  }

  const resolvedPayment = payment ?? (order?.paymentId ? getPayment(order.paymentId) : null);
  const status = fromOrderStatus(order?.status ?? "pending");
  const origin = publicAppOrigin();
  const courseId = order?.items[0]?.courseId ?? "";
  const studentId = order && order.studentId !== GUEST_STUDENT_ID ? order.studentId : "";

  return {
    sessionId:
      resolvedPayment?.checkoutSessionId || resolvedPayment?.providerPaymentId || order?.id || id,
    status,
    paymentStatus: resolvedPayment?.status ?? order?.status ?? "pending",
    courseId,
    studentId,
    instructorId: order?.items[0]?.instructorId ?? "",
    currency: order?.currency ?? resolvedPayment?.currency ?? "KWD",
    amount: order?.totalAmount ?? resolvedPayment?.amount ?? 0,
    paid: status === "paid" || resolvedPayment?.status === "succeeded",
    enrollmentPending: status !== "paid",
    successUrl: `${origin}${routes.paymentSuccess}?session_id=${encodeURIComponent(order?.id ?? id)}`,
    cancelUrl: `${origin}${routes.paymentCancel}?session_id=${encodeURIComponent(order?.id ?? id)}`,
  };
}
