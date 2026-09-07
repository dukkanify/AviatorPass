/**
 * Stripe webhook processor — signature verified, retry-safe, idempotent by event id.
 */

import type Stripe from "stripe";

import { generateId } from "@/lib/security/crypto";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity, logAudit } from "@/services/auth/activity-log";
import { PaymentError } from "@/services/payments/access";
import { getOrder, getPayment } from "@/services/payments/checkout-service";
import { formatMinor } from "@/services/payments/money";
import { notifyPayment } from "@/services/payments/notify";
import {
  GUEST_STUDENT_ID,
  fulfillGuestPaidOrder,
  getAtplPackageProduct,
} from "@/services/payments/purchase-first-service";
import {
  getStripeClient,
  isStripeConfigured,
  isStripeWebhookConfigured,
} from "@/services/payments/stripe-client";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { clawbackForRefund } from "@/services/payments/wallet-service";
import type { Order, PaymentRecord, Subscription } from "@/types/payments";
import { sanitizeEmail, sanitizeString } from "@/utils/sanitize";

const HANDLED_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export type StripeWebhookResult = {
  eventId: string;
  type: string;
  duplicate: boolean;
  handled: boolean;
  paymentId: string | null;
  orderId: string | null;
  status: string;
};

function nowIso() {
  return new Date().toISOString();
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
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
      provider: "stripe",
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

function findPayment(refs: {
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  invoiceId?: string | null;
  orderId?: string | null;
  providerPaymentId?: string | null;
}): PaymentRecord | null {
  const payments = readPaymentsDb().payments;
  if (refs.checkoutSessionId) {
    const bySession = payments.find(
      (p) =>
        p.checkoutSessionId === refs.checkoutSessionId ||
        p.providerPaymentId === refs.checkoutSessionId,
    );
    if (bySession) return bySession;
    if (refs.orderId) {
      return payments.find((p) => p.orderId === refs.orderId) ?? null;
    }
    return null;
  }
  return (
    payments.find(
      (p) =>
        (refs.paymentIntentId && p.paymentIntentId === refs.paymentIntentId) ||
        (refs.invoiceId && p.stripeInvoiceId === refs.invoiceId) ||
        (refs.providerPaymentId && p.providerPaymentId === refs.providerPaymentId) ||
        (refs.orderId && p.orderId === refs.orderId) ||
        (refs.chargeId && str(p.rawProviderPayload.chargeId) === refs.chargeId),
    ) ?? null
  );
}

function findOrder(orderId: string | null): Order | null {
  if (!orderId) return null;
  return getOrder(orderId);
}

function nextReconstructedOrderNumber(): string {
  const y = new Date().getFullYear();
  const n = readPaymentsDb().orders.length + 1;
  return `ORD-${y}-${String(n).padStart(5, "0")}`;
}

/**
 * Vercel serverless uses an in-memory JSON store. The Checkout Session that
 * created the pending order may have run on a different isolate. Rebuild the
 * order from Stripe so fulfillment still succeeds.
 */
function materializeOrderFromSession(
  session: Stripe.Checkout.Session,
  preferredId: string | null,
): Order {
  const product = getAtplPackageProduct();
  if (!product) {
    throw new PaymentError("ATPL product is not available for Stripe fulfillment", 500);
  }
  const stamp = nowIso();
  const id = preferredId || generateId();
  const existing = getOrder(id);
  if (existing) return existing;

  const email =
    str(session.customer_details?.email) ??
    str(session.customer_email) ??
    `pending+${id.slice(0, 10)}@checkout.invalid`;
  const name = str(session.customer_details?.name) ?? "Aviator Pass student";
  const country = (session.customer_details?.address?.country ?? "US").toUpperCase();
  const amount = session.amount_total ?? product.priceAmount;
  const currency = (session.currency ?? product.currency ?? "usd").toUpperCase();
  const item = {
    id: generateId(),
    productId: product.id,
    productName: product.name,
    courseId: product.courseId,
    instructorId: product.instructorId,
    pricingModel: product.pricingModel,
    unitAmount: session.amount_subtotal ?? amount,
    quantity: 1,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: amount,
  };
  const order: Order = {
    id,
    orderNumber: nextReconstructedOrderNumber(),
    studentId: GUEST_STUDENT_ID,
    studentName: name,
    studentEmail: sanitizeEmail(email),
    status: "pending",
    currency,
    subtotalAmount: session.amount_subtotal ?? amount,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: amount,
    couponId: null,
    couponCode: null,
    billingName: name,
    billingEmail: sanitizeEmail(email),
    billingCountry: country,
    billingAddress: "",
    items: [item],
    paymentId: null,
    invoiceId: null,
    idempotencyKey: `stripe-session-${session.id}`,
    failureReason: null,
    paidAt: null,
    cancelledAt: null,
    expiresAt: null,
    metadata: {
      purchaseFirst: true,
      hostedCheckout: true,
      reconstructed: true,
      guestCountry: country,
      stripeSessionId: session.id,
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
  writePaymentsDb((db) => {
    if (!db.orders.some((o) => o.id === order.id)) {
      db.orders.unshift(order);
    }
  });
  return getOrder(id) ?? order;
}

function ensureOrderForSession(session: Stripe.Checkout.Session): Order {
  const existingId = metadataOrderId(session);
  return findOrder(existingId) ?? materializeOrderFromSession(session, existingId);
}

function metadataOrderId(object: {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
}) {
  return str(object.metadata?.orderId) ?? str(object.client_reference_id);
}

function patchPayment(paymentId: string, patch: Partial<PaymentRecord>) {
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === paymentId);
    if (!p) return;
    Object.assign(p, patch, { updatedAt: nowIso() });
  });
}

async function stripeFeeFromPaymentIntent(
  stripe: ReturnType<typeof getStripeClient>,
  paymentIntentId: string | null,
): Promise<{
  fee: number | null;
  net: number | null;
  receiptUrl: string | null;
  chargeId: string | null;
  country: string | null;
  billingAddress: string | null;
}> {
  if (!paymentIntentId) {
    return {
      fee: null,
      net: null,
      receiptUrl: null,
      chargeId: null,
      country: null,
      billingAddress: null,
    };
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = pi.latest_charge;
    const chargeObj = charge && typeof charge === "object" ? charge : null;
    const bt =
      chargeObj && typeof chargeObj.balance_transaction === "object"
        ? chargeObj.balance_transaction
        : null;
    const address = chargeObj?.billing_details?.address;
    const billingAddress = address
      ? [
          address.line1,
          address.line2,
          address.city,
          address.state,
          address.postal_code,
          address.country,
        ]
          .filter(Boolean)
          .join(", ")
      : null;
    return {
      fee: bt && typeof bt.fee === "number" ? bt.fee : null,
      net: bt && typeof bt.net === "number" ? bt.net : null,
      receiptUrl: chargeObj?.receipt_url ?? null,
      chargeId: chargeObj?.id ?? (typeof charge === "string" ? charge : null),
      country: address?.country ?? chargeObj?.billing_details?.address?.country ?? null,
      billingAddress,
    };
  } catch {
    return {
      fee: null,
      net: null,
      receiptUrl: null,
      chargeId: null,
      country: null,
      billingAddress: null,
    };
  }
}

function applyCustomerDetailsToOrder(
  orderId: string,
  details: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    country?: string | null;
    address?: string | null;
  },
) {
  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return;
    if (details.email) {
      o.billingEmail = sanitizeEmail(details.email);
      o.studentEmail = sanitizeEmail(details.email);
    }
    if (details.name) {
      o.billingName = sanitizeString(details.name);
      o.studentName = sanitizeString(details.name);
      const parts = details.name.trim().split(/\s+/);
      o.metadata = {
        ...o.metadata,
        guestFirstName: parts[0] ?? o.metadata.guestFirstName,
        guestLastName: parts.slice(1).join(" ") || o.metadata.guestLastName,
      };
    }
    if (details.phone) {
      o.metadata = { ...o.metadata, guestPhone: details.phone };
    }
    if (details.country) {
      o.billingCountry = details.country.toUpperCase();
      o.metadata = { ...o.metadata, guestCountry: details.country.toUpperCase() };
    }
    if (details.address) o.billingAddress = sanitizeString(details.address);
    o.updatedAt = nowIso();
  });
}

async function fulfillIfPaid(payment: PaymentRecord) {
  const order = getOrder(payment.orderId);
  const freshPayment = getPayment(payment.id);
  if (!order || !freshPayment) return;
  if (freshPayment.status !== "succeeded" && order.status !== "paid") return;
  if (order.metadata?.purchaseFirst) {
    await fulfillGuestPaidOrder(order, freshPayment);
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const order = ensureOrderForSession(session);

  let payment = findPayment({
    checkoutSessionId: session.id,
    orderId: order.id,
    paymentIntentId: str(session.payment_intent),
  });

  const stamp = nowIso();
  if (!payment) {
    payment = {
      id: generateId(),
      orderId: order.id,
      provider: "stripe",
      providerPaymentId: session.id,
      status: session.payment_status === "paid" ? "succeeded" : "processing",
      methodBrand: "card",
      paymentMethodSummary: "Stripe Checkout",
      amount: session.amount_total ?? order.totalAmount,
      currency: (session.currency ?? order.currency).toUpperCase(),
      clientSecret: null,
      checkoutUrl: session.url,
      webhookVerified: true,
      failureCode: null,
      failureMessage: null,
      rawProviderPayload: { sessionId: session.id },
      createdAt: stamp,
      updatedAt: stamp,
      ...blankStripePaymentFields(),
    };
    writePaymentsDb((db) => {
      db.payments.unshift(payment!);
      const o = db.orders.find((x) => x.id === order.id);
      if (o) o.paymentId = payment!.id;
    });
  }

  const piId = str(session.payment_intent);
  const stripe = isStripeConfigured() ? getStripeClient() : null;
  const fees = stripe
    ? await stripeFeeFromPaymentIntent(stripe, piId)
    : {
        fee: null,
        net: null,
        receiptUrl: null,
        chargeId: null,
        country: null,
        billingAddress: null,
      };
  const address = session.customer_details?.address;
  const addressLine = address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.postal_code,
        address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : fees.billingAddress;

  applyCustomerDetailsToOrder(order.id, {
    email: session.customer_details?.email ?? session.customer_email,
    name: session.customer_details?.name,
    phone: session.customer_details?.phone,
    country: address?.country ?? fees.country,
    address: addressLine,
  });

  const paid = session.payment_status === "paid" || session.status === "complete";
  patchPayment(payment.id, {
    status: paid ? "succeeded" : "processing",
    webhookVerified: true,
    checkoutSessionId: session.id,
    paymentIntentId: piId,
    stripeCustomerId: str(session.customer),
    stripeInvoiceId: str(session.invoice),
    receiptUrl: fees.receiptUrl,
    stripeFeeMinor: fees.fee,
    netAmountMinor: fees.net,
    country: address?.country ?? fees.country,
    billingAddressSnapshot: addressLine,
    amount: session.amount_total ?? payment.amount,
    currency: (session.currency ?? payment.currency).toUpperCase(),
    providerPaymentId: session.id,
    rawProviderPayload: {
      ...payment.rawProviderPayload,
      sessionId: session.id,
      paymentIntentId: piId,
      chargeId: fees.chargeId,
      customerId: str(session.customer),
    },
  });

  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    if (paid) {
      o.status = "paid";
      o.paidAt = o.paidAt ?? stamp;
      o.failureReason = null;
    }
    o.currency = (session.currency ?? o.currency).toUpperCase();
    if (typeof session.amount_total === "number") {
      o.totalAmount = session.amount_total;
      o.subtotalAmount = session.amount_subtotal ?? session.amount_total;
    }
    o.updatedAt = stamp;
  });

  if (paid) {
    await fulfillIfPaid(getPayment(payment.id)!);
  }

  return { paymentId: payment.id, orderId: order.id, status: paid ? "succeeded" : "processing" };
}

/** Used by `/welcome` when the webhook isolate did not share the local order store. */
export async function fulfillStripeCheckoutSession(session: Stripe.Checkout.Session) {
  return handleCheckoutSessionCompleted(session);
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const orderId = metadataOrderId(pi);
  const payment = findPayment({
    paymentIntentId: pi.id,
    orderId,
    checkoutSessionId: str(pi.metadata?.checkoutSessionId),
  });
  if (!payment) {
    return { paymentId: null, orderId, status: "ignored" };
  }
  const stripe = isStripeConfigured() ? getStripeClient() : null;
  const fees = stripe
    ? await stripeFeeFromPaymentIntent(stripe, pi.id)
    : {
        fee: null,
        net: null,
        receiptUrl: null,
        chargeId: null,
        country: null,
        billingAddress: null,
      };
  patchPayment(payment.id, {
    status: "succeeded",
    webhookVerified: true,
    paymentIntentId: pi.id,
    receiptUrl: fees.receiptUrl ?? payment.receiptUrl,
    stripeFeeMinor: fees.fee ?? payment.stripeFeeMinor,
    netAmountMinor: fees.net ?? payment.netAmountMinor,
    country: fees.country ?? payment.country,
    billingAddressSnapshot: fees.billingAddress ?? payment.billingAddressSnapshot,
    amount: pi.amount_received || pi.amount || payment.amount,
    currency: (pi.currency ?? payment.currency).toUpperCase(),
    rawProviderPayload: {
      ...payment.rawProviderPayload,
      paymentIntentId: pi.id,
      chargeId: fees.chargeId,
    },
  });
  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (!o || o.status === "paid") return;
    o.status = "paid";
    o.paidAt = o.paidAt ?? nowIso();
    o.updatedAt = nowIso();
  });
  await fulfillIfPaid(getPayment(payment.id)!);
  return { paymentId: payment.id, orderId: payment.orderId, status: "succeeded" };
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const orderId = metadataOrderId(pi);
  const payment = findPayment({ paymentIntentId: pi.id, orderId });
  if (!payment) {
    return { paymentId: null, orderId, status: "ignored" };
  }
  const message = pi.last_payment_error?.message ?? "Payment failed";
  patchPayment(payment.id, {
    status: "failed",
    webhookVerified: true,
    paymentIntentId: pi.id,
    failureCode: pi.last_payment_error?.code ?? "payment_intent.payment_failed",
    failureMessage: message,
  });
  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (!o || o.status === "paid") return;
    o.status = "failed";
    o.failureReason = message;
    o.updatedAt = nowIso();
  });
  await logActivity({
    actorId: null,
    action: ACTIVITY_ACTIONS.PAYMENT_FAILED,
    entityType: "payment",
    entityId: payment.id,
    metadata: { stripe: true, createdAccount: false },
  });
  return { paymentId: payment.id, orderId: payment.orderId, status: "failed" };
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const piId = str(charge.payment_intent);
  const payment = findPayment({ paymentIntentId: piId, chargeId: charge.id });
  if (!payment) {
    return { paymentId: null, orderId: null, status: "ignored" };
  }
  const full = Boolean(charge.refunded);
  const stamp = nowIso();
  writePaymentsDb((db) => {
    const p = db.payments.find((x) => x.id === payment.id);
    if (p) {
      p.status = full ? "refunded" : "partially_refunded";
      p.webhookVerified = true;
      p.updatedAt = stamp;
      p.rawProviderPayload = {
        ...p.rawProviderPayload,
        chargeId: charge.id,
        refunded: charge.refunded,
      };
    }
    const o = db.orders.find((x) => x.id === payment.orderId);
    if (o && full) {
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
        amount: charge.amount_refunded || payment.amount,
        currency: (charge.currency ?? payment.currency).toUpperCase(),
        isPartial: !full,
        reason: "Stripe charge.refunded",
        status: "processed",
        adminNotes: "Applied from Stripe webhook",
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
      amount: charge.amount_refunded || payment.amount,
      currency: payment.currency,
      description: `Stripe refund for ${o?.orderNumber ?? payment.orderId}`,
      metadata: { chargeId: charge.id, full },
      createdAt: stamp,
    });
  });

  const order = getOrder(payment.orderId);
  if (order) {
    for (const item of order.items) {
      if (item.instructorId) {
        const share = Math.round(
          ((charge.amount_refunded || payment.amount) * (item.totalAmount || 1)) /
            Math.max(order.totalAmount, 1),
        );
        clawbackForRefund(item.instructorId, share, order.id);
      }
    }
    if (order.studentId && order.studentId !== GUEST_STUDENT_ID) {
      await notifyPayment(order.studentId, {
        title: full ? "Refund processed" : "Partial refund processed",
        body: `${formatMinor(charge.amount_refunded || payment.amount, payment.currency)} was refunded for ${order.orderNumber}.`,
        type: "refund.approved",
        reference: order.orderNumber,
        amountLabel: formatMinor(charge.amount_refunded || payment.amount, payment.currency),
      });
    }
  }
  await logAudit({
    actorId: null,
    action: "payments.stripe_refunded",
    resource: `payment:${payment.id}`,
    afterState: { chargeId: charge.id, full },
  });
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    status: full ? "refunded" : "partially_refunded",
  };
}

async function handleInvoice(invoice: Stripe.Invoice, paid: boolean) {
  const raw = invoice as Stripe.Invoice & { payment_intent?: string | { id?: string } | null };
  const piId = str(
    typeof raw.payment_intent === "object" ? raw.payment_intent?.id : raw.payment_intent,
  );
  const payment = findPayment({
    paymentIntentId: piId,
    invoiceId: invoice.id,
    orderId: str(invoice.metadata?.orderId),
  });
  if (!payment) {
    return { paymentId: null, orderId: null, status: "ignored" };
  }
  patchPayment(payment.id, {
    stripeInvoiceId: invoice.id,
    webhookVerified: true,
    receiptUrl:
      typeof invoice.hosted_invoice_url === "string"
        ? invoice.hosted_invoice_url
        : payment.receiptUrl,
    status: paid ? "succeeded" : payment.status,
    failureMessage: paid
      ? null
      : (str(
          (invoice as { last_finalization_error?: { message?: string } }).last_finalization_error
            ?.message,
        ) ?? payment.failureMessage),
  });
  if (!paid && payment.orderId) {
    const order = getOrder(payment.orderId);
    if (order?.studentId && order.studentId !== GUEST_STUDENT_ID) {
      await notifyPayment(order.studentId, {
        title: "Invoice payment failed",
        body: `Stripe could not collect ${formatMinor(invoice.amount_due ?? payment.amount, payment.currency)}.`,
        type: "payment.failed",
        reference: order.orderNumber,
      });
    }
  }
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    status: paid ? "invoice.paid" : "invoice.payment_failed",
  };
}

function subscriptionPeriod(sub: Stripe.Subscription): { start: number; end: number } {
  const raw = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  return {
    start: raw.current_period_start ?? 0,
    end: raw.current_period_end ?? 0,
  };
}

function upsertSubscription(sub: Stripe.Subscription, status: Subscription["status"]) {
  const stamp = nowIso();
  const stripeId = sub.id;
  const period = subscriptionPeriod(sub);
  writePaymentsDb((db) => {
    const existing = db.subscriptions.find(
      (s) => str(s.metadata?.stripeSubscriptionId) === stripeId,
    );
    const row: Subscription = existing ?? {
      id: generateId(),
      studentId: str(sub.metadata?.studentId) ?? "unknown",
      productId: str(sub.metadata?.productId) ?? "stripe-subscription",
      productName: "Stripe subscription",
      status,
      pricingModel: "subscription_monthly",
      amount: sub.items.data[0]?.price?.unit_amount ?? 0,
      currency: (sub.currency ?? "usd").toUpperCase(),
      currentPeriodStart: new Date(period.start * 1000).toISOString(),
      currentPeriodEnd: new Date(period.end * 1000).toISOString(),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      orderId: str(sub.metadata?.orderId),
      createdAt: stamp,
      updatedAt: stamp,
      metadata: { stripeSubscriptionId: stripeId },
    };
    row.metadata = { ...(row.metadata ?? {}), stripeSubscriptionId: stripeId };
    row.status = status;
    row.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    row.canceledAt = sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : row.canceledAt;
    row.updatedAt = stamp;
    if (!existing) db.subscriptions.unshift(row);
  });
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): Subscription["status"] {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (
    status === "past_due" ||
    status === "unpaid" ||
    status === "incomplete" ||
    status === "incomplete_expired"
  ) {
    return "past_due";
  }
  if (status === "canceled") return "canceled";
  return "expired";
}

export async function processVerifiedStripeEvent(
  event: Stripe.Event,
): Promise<StripeWebhookResult> {
  if (alreadyProcessed(event.id)) {
    return {
      eventId: event.id,
      type: event.type,
      duplicate: true,
      handled: true,
      paymentId: null,
      orderId: null,
      status: "duplicate",
    };
  }

  let paymentId: string | null = null;
  let orderId: string | null = null;
  let status = "ignored";

  if (HANDLED_TYPES.has(event.type)) {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "payment_intent.succeeded": {
        const result = await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "payment_intent.payment_failed": {
        const result = await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "charge.refunded": {
        const result = await handleChargeRefunded(event.data.object as Stripe.Charge);
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "invoice.paid": {
        const result = await handleInvoice(event.data.object as Stripe.Invoice, true);
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "invoice.payment_failed": {
        const result = await handleInvoice(event.data.object as Stripe.Invoice, false);
        paymentId = result.paymentId;
        orderId = result.orderId;
        status = result.status;
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const mapped =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapSubscriptionStatus(sub.status);
        upsertSubscription(sub, mapped);
        status = mapped;
        break;
      }
      default:
        break;
    }
  } else {
    status = "unhandled";
  }

  markProcessed({
    eventId: event.id,
    type: event.type,
    paymentId,
    orderId,
    result: status,
  });

  await logAudit({
    actorId: null,
    action: `payments.stripe.${event.type}`,
    resource: `stripe_event:${event.id}`,
    afterState: { type: event.type, paymentId, orderId, status },
  });

  return {
    eventId: event.id,
    type: event.type,
    duplicate: false,
    handled: HANDLED_TYPES.has(event.type),
    paymentId,
    orderId,
    status,
  };
}

export async function handleStripeWebhook(
  payload: string,
  signature: string | null,
): Promise<StripeWebhookResult> {
  if (!isStripeWebhookConfigured()) {
    throw new PaymentError("Stripe webhook secret not configured", 503);
  }
  if (!signature) {
    throw new PaymentError("Missing Stripe-Signature header", 400);
  }
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!.trim(),
    );
  } catch {
    throw new PaymentError("Invalid Stripe webhook signature", 400);
  }
  return processVerifiedStripeEvent(event);
}
