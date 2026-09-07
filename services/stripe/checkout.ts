/**
 * Hosted Stripe Checkout Sessions from AviatorPass course data.
 * Always uses price_data — never Stripe Price or Product IDs.
 * Never returns secret keys. Omits payment_method_types (dynamic methods).
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId, generateToken } from "@/lib/security/crypto";
import { publicAppOrigin } from "@/lib/site-origin";
import { ORDER_EXPIRY_MINUTES } from "@/constants/payments";
import { logActivity } from "@/services/auth/activity-log";
import { readAuthDb } from "@/services/auth/store";
import { PaymentError } from "@/services/payments/access";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { STRIPE_API_VERSION, getStripeClient, isStripeConfigured } from "@/services/stripe/client";
import { stripeCancelUrl, stripeSuccessUrl } from "@/services/stripe/config";
import { resolveCourseOffer } from "@/services/stripe/course-offer";
import { ensurePendingEnrollment } from "@/services/stripe/fulfillment";
import { logStripeEvent } from "@/services/stripe/logging";
import {
  buildDynamicPriceDataLineItem,
  stripeCheckoutMetadata,
} from "@/services/stripe/price-data";
import { upsertCheckout } from "@/services/stripe/store";
import type {
  CreateCheckoutSessionInput,
  StripeCheckoutMode,
  StripeCheckoutRecord,
} from "@/services/stripe/types";
import type { Order, OrderItem, PaymentRecord } from "@/types/payments";
import { sanitizeEmail, sanitizeString } from "@/utils/sanitize";

const GUEST_STUDENT_ID = "guest";

function nowIso() {
  return new Date().toISOString();
}

function integrationIdentifier(): string {
  const suffix = generateToken(6)
    .replace(/[^a-zA-Z]/g, "x")
    .slice(0, 8)
    .padEnd(8, "a");
  return `aviatorpass${suffix}`;
}

function nextOrderNumber(): string {
  const y = new Date().getFullYear();
  const n = readPaymentsDb().orders.length + 1;
  return `ORD-${y}-${String(n).padStart(5, "0")}`;
}

function reusePendingCheckout(input: {
  studentId: string;
  courseId: string;
  currency: string;
  amount: number;
  idempotencyKey: string;
}): { url: string; sessionId: string; checkoutId: string; status: "pending" } | null {
  const db = readPaymentsDb();
  const byKey = db.orders.find(
    (o) => o.idempotencyKey === input.idempotencyKey && o.status === "pending",
  );
  const byStudentCourse =
    byKey ??
    db.orders.find(
      (o) =>
        o.status === "pending" &&
        o.studentId === input.studentId &&
        o.currency === input.currency &&
        o.totalAmount === input.amount &&
        o.items.some((item) => item.courseId === input.courseId) &&
        Boolean(o.metadata?.checkoutUrl) &&
        Boolean(o.metadata?.stripeSessionId) &&
        (!o.expiresAt || Date.parse(o.expiresAt) > Date.now()),
    );
  if (byStudentCourse?.metadata?.checkoutUrl && byStudentCourse.metadata.stripeSessionId) {
    return {
      url: String(byStudentCourse.metadata.checkoutUrl),
      sessionId: String(byStudentCourse.metadata.stripeSessionId),
      checkoutId: String(byStudentCourse.metadata.stripeCheckoutId ?? byStudentCourse.id),
      status: "pending",
    };
  }
  return null;
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{
  url: string;
  sessionId: string;
  checkoutId: string;
  status: "pending";
}> {
  const offer = resolveCourseOffer({
    courseId: input.courseId,
    instructorId: input.instructorId,
    currency: input.currency,
    amount: input.amount,
  });
  if (!isStripeConfigured()) {
    throw new PaymentError(
      "Stripe secret key is not configured. Set STRIPE_SECRET_KEY to enable Checkout.",
      503,
    );
  }
  const email = input.email ? sanitizeEmail(input.email) : "";
  const studentId = sanitizeString(input.studentId || "") || GUEST_STUDENT_ID;
  const mode: StripeCheckoutMode = input.mode ?? "payment";
  if (mode === "setup") {
    throw new PaymentError(
      "Setup mode is reserved for saving cards; use payment or subscription",
      422,
    );
  }

  const idempotencyKey = input.idempotencyKey?.trim() || generateToken(16);
  const reused = reusePendingCheckout({
    studentId,
    courseId: offer.courseId,
    currency: offer.currency,
    amount: offer.amount,
    idempotencyKey,
  });
  if (reused) return reused;

  const stamp = nowIso();
  const origin = publicAppOrigin();
  const successUrl = stripeSuccessUrl(origin);
  const cancelUrl = stripeCancelUrl(origin);

  const item: OrderItem = {
    id: generateId(),
    productId: offer.productId ?? offer.courseId,
    productName: offer.title,
    courseId: offer.courseId,
    instructorId: offer.instructorId || null,
    pricingModel: mode === "subscription" ? "subscription_monthly" : offer.pricingModel,
    unitAmount: offer.amount,
    quantity: 1,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: offer.amount,
  };

  const order: Order = {
    id: generateId(),
    orderNumber: nextOrderNumber(),
    studentId,
    studentName:
      readAuthDb().users.find((u) => u.id === studentId)?.email ||
      input.customerName ||
      "Aviator Pass student",
    studentEmail: email || `${studentId}@checkout.invalid`,
    status: "pending",
    currency: offer.currency,
    subtotalAmount: offer.amount,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: offer.amount,
    couponId: null,
    couponCode: null,
    billingName: input.customerName || "Aviator Pass student",
    billingEmail: email || `${studentId}@checkout.invalid`,
    billingCountry: (input.country || "US").toUpperCase(),
    billingAddress: "",
    items: [item],
    paymentId: null,
    invoiceId: null,
    idempotencyKey,
    failureReason: null,
    paidAt: null,
    cancelledAt: null,
    expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000).toISOString(),
    metadata: {
      hostedCheckout: true,
      stripeCheckout: true,
      courseSlug: offer.courseSlug,
      platform: "AviatorPass",
    },
    createdAt: stamp,
    updatedAt: stamp,
  };

  writePaymentsDb((db) => {
    db.orders.unshift(order);
  });

  const enrollment = await ensurePendingEnrollment({
    courseId: offer.courseId,
    studentId,
    actorId: studentId === GUEST_STUDENT_ID ? null : studentId,
  });

  const metadata = stripeCheckoutMetadata({
    courseId: offer.courseId,
    studentId,
    instructorId: offer.instructorId,
    courseSlug: offer.courseSlug,
    currency: offer.currency,
    amount: offer.amount,
    extra: { orderId: order.id },
  });

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create(
    {
      mode: mode === "subscription" ? "subscription" : "payment",
      line_items: [buildDynamicPriceDataLineItem(offer, mode)],
      customer_email: email.includes("@") && !email.endsWith(".invalid") ? email : undefined,
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      customer_creation: mode === "payment" ? "always" : undefined,
      invoice_creation: mode === "payment" ? { enabled: true } : undefined,
      client_reference_id: order.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      payment_intent_data:
        mode === "payment"
          ? {
              metadata,
              ...(offer.instructorId ? { transfer_group: `instructor:${offer.instructorId}` } : {}),
            }
          : undefined,
      subscription_data: mode === "subscription" ? { metadata } : undefined,
      integration_identifier: integrationIdentifier(),
      locale: "auto",
    },
    { idempotencyKey },
  );

  if (!session.url) {
    throw new PaymentError("Stripe did not return a Checkout URL", 502);
  }

  const payment: PaymentRecord = {
    id: generateId(),
    orderId: order.id,
    provider: "stripe",
    providerPaymentId: session.id,
    status: "requires_payment",
    methodBrand: "card",
    paymentMethodSummary: "Stripe Checkout",
    amount: offer.amount,
    currency: offer.currency,
    clientSecret: null,
    checkoutUrl: session.url,
    webhookVerified: false,
    failureCode: null,
    failureMessage: null,
    rawProviderPayload: {
      sessionId: session.id,
      status: session.status,
      apiVersion: STRIPE_API_VERSION,
      priceData: true,
    },
    createdAt: stamp,
    updatedAt: stamp,
    ...blankStripePaymentFields(),
    checkoutSessionId: session.id,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    country: input.country ?? null,
    studentId,
    courseId: offer.courseId,
  };

  writePaymentsDb((db) => {
    db.payments.unshift(payment);
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.paymentId = payment.id;
    o.updatedAt = nowIso();
    o.metadata = {
      ...o.metadata,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
      stripeCheckoutId: payment.id,
    };
  });

  const record: StripeCheckoutRecord = {
    id: generateId(),
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
    stripeConnectAccountId: null,
    mode,
    status: "pending",
    courseId: offer.courseId,
    studentId,
    instructorId: offer.instructorId,
    currency: offer.currency,
    amount: offer.amount,
    enrollmentId: enrollment?.id ?? null,
    orderId: order.id,
    paymentId: payment.id,
    checkoutUrl: session.url,
    successUrl,
    cancelUrl,
    failureMessage: null,
    createdAt: stamp,
    updatedAt: stamp,
    paidAt: null,
  };
  upsertCheckout(record);

  await logActivity({
    actorId: studentId === GUEST_STUDENT_ID ? null : studentId,
    action: ACTIVITY_ACTIONS.CHECKOUT_STARTED,
    entityType: "order",
    entityId: order.id,
    metadata: {
      stripe: true,
      courseId: offer.courseId,
      courseSlug: offer.courseSlug,
      currency: offer.currency,
      amount: offer.amount,
      mode,
      priceData: true,
    },
  });
  logStripeEvent({
    message: "Created hosted Checkout Session from AviatorPass course",
    path: "/api/payments/create-checkout-session",
    userId: studentId === GUEST_STUDENT_ID ? null : studentId,
    details: {
      sessionId: session.id,
      orderId: order.id,
      courseId: offer.courseId,
      currency: offer.currency,
      amount: offer.amount,
      mode,
    },
  });

  return {
    url: session.url,
    sessionId: session.id,
    checkoutId: record.id,
    status: "pending",
  };
}
