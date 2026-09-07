/**
 * Hosted Stripe Checkout Sessions.
 * Never returns secret keys. Omits payment_method_types (dynamic methods).
 */

import Stripe from "stripe";

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId, generateToken } from "@/lib/security/crypto";
import { publicAppOrigin } from "@/lib/site-origin";
import { logActivity } from "@/services/auth/activity-log";
import { readAuthDb } from "@/services/auth/store";
import { PaymentError } from "@/services/payments/access";
import { getProduct, listProducts } from "@/services/payments/catalog-service";
import { getCourseById } from "@/services/courses/course-service";
import { ORDER_EXPIRY_MINUTES } from "@/constants/payments";
import { getAtplPackageProduct } from "@/services/payments/purchase-first-service";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
import { tryResolveStripePrice } from "@/services/payments/stripe-catalog";
import { STRIPE_API_VERSION, getStripeClient, isStripeConfigured } from "@/services/stripe/client";
import {
  isStripeCheckoutCurrency,
  stripeCancelUrl,
  stripeSuccessUrl,
} from "@/services/stripe/config";
import { ensurePendingEnrollment } from "@/services/stripe/fulfillment";
import { logStripeEvent } from "@/services/stripe/logging";
import { upsertCheckout } from "@/services/stripe/store";
import type {
  CreateCheckoutSessionInput,
  StripeCheckoutCurrency,
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

function normalizeCurrency(raw: string): StripeCheckoutCurrency {
  const upper = raw.trim().toUpperCase();
  if (!isStripeCheckoutCurrency(upper)) {
    throw new PaymentError("Currency must be AED, USD, KWD, or SAR", 422);
  }
  return upper;
}

function resolveCatalog(input: CreateCheckoutSessionInput) {
  const courseId = sanitizeString(input.courseId || "");
  if (!courseId) throw new PaymentError("courseId is required", 422);

  const product =
    getProduct(courseId) ||
    listProducts().find((p) => p.courseId === courseId && p.active) ||
    (getAtplPackageProduct()?.courseId === courseId || getAtplPackageProduct()?.id === courseId
      ? getAtplPackageProduct()
      : null);

  const course =
    getCourseById(courseId) ?? (product?.courseId ? getCourseById(product.courseId) : null);
  const resolvedCourseId = course?.id || product?.courseId || courseId;
  const instructorId =
    sanitizeString(input.instructorId || "") ||
    product?.instructorId ||
    course?.primaryInstructorId ||
    "";
  const name = product?.name || course?.title || "Aviator Pass";
  return {
    courseId: resolvedCourseId,
    instructorId,
    product,
    course,
    name,
  };
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{
  url: string;
  sessionId: string;
  checkoutId: string;
  status: "pending";
}> {
  const currency = normalizeCurrency(input.currency);
  if (!isStripeConfigured()) {
    throw new PaymentError(
      "Stripe secret key is not configured. Set STRIPE_SECRET_KEY to enable Checkout.",
      503,
    );
  }
  const catalog = resolveCatalog(input);
  const email = input.email ? sanitizeEmail(input.email) : "";
  const studentId = sanitizeString(input.studentId || "") || GUEST_STUDENT_ID;
  const mode: StripeCheckoutMode = input.mode ?? "payment";
  if (mode === "setup") {
    throw new PaymentError(
      "Setup mode is reserved for saving cards; use payment or subscription",
      422,
    );
  }

  const price = await tryResolveStripePrice(currency);
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(input.amount)
      : (price?.unitAmount ?? catalog.product?.priceAmount ?? 0);
  if (!amount || amount < 1) {
    throw new PaymentError("A positive amount is required", 422);
  }

  if (mode === "subscription" && price && !price.stripePriceId) {
    throw new PaymentError("A recurring Stripe Price is required for subscriptions", 422);
  }

  const origin = publicAppOrigin();
  const successUrl = stripeSuccessUrl(origin);
  const cancelUrl = stripeCancelUrl(origin);
  const stamp = nowIso();
  const idempotencyKey = input.idempotencyKey?.trim() || generateToken(16);
  const existingOrder = readPaymentsDb().orders.find(
    (o) => o.idempotencyKey === idempotencyKey && o.status === "pending",
  );
  if (existingOrder?.metadata?.checkoutUrl && existingOrder.metadata.stripeSessionId) {
    return {
      url: String(existingOrder.metadata.checkoutUrl),
      sessionId: String(existingOrder.metadata.stripeSessionId),
      checkoutId: String(existingOrder.metadata.stripeCheckoutId ?? existingOrder.id),
      status: "pending",
    };
  }

  const item: OrderItem = {
    id: generateId(),
    productId: catalog.product?.id ?? catalog.courseId,
    productName: catalog.name,
    courseId: catalog.courseId,
    instructorId: catalog.instructorId || null,
    pricingModel:
      mode === "subscription"
        ? "subscription_monthly"
        : (catalog.product?.pricingModel ?? "one_time"),
    unitAmount: amount,
    quantity: 1,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: amount,
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
    currency,
    subtotalAmount: amount,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: amount,
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
    },
    createdAt: stamp,
    updatedAt: stamp,
  };

  writePaymentsDb((db) => {
    db.orders.unshift(order);
  });

  const enrollment = await ensurePendingEnrollment({
    courseId: catalog.courseId,
    studentId,
    actorId: studentId === GUEST_STUDENT_ID ? null : studentId,
  });

  const stripe = getStripeClient();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = price?.stripePriceId
    ? [{ price: price.stripePriceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: catalog.name,
              metadata: { courseId: catalog.courseId },
            },
          },
        },
      ];

  const metadata = {
    courseId: catalog.courseId,
    studentId,
    instructorId: catalog.instructorId,
    currency,
    amount: String(amount),
    orderId: order.id,
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: mode === "subscription" ? "subscription" : "payment",
      line_items: lineItems,
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
              ...(catalog.instructorId
                ? {
                    transfer_group: `instructor:${catalog.instructorId}`,
                  }
                : {}),
            }
          : undefined,
      subscription_data:
        mode === "subscription"
          ? {
              metadata,
            }
          : undefined,
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
    amount,
    currency,
    clientSecret: null,
    checkoutUrl: session.url,
    webhookVerified: false,
    failureCode: null,
    failureMessage: null,
    rawProviderPayload: {
      sessionId: session.id,
      status: session.status,
      apiVersion: STRIPE_API_VERSION,
    },
    createdAt: stamp,
    updatedAt: stamp,
    ...blankStripePaymentFields(),
    checkoutSessionId: session.id,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    country: input.country ?? null,
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
    courseId: catalog.courseId,
    studentId,
    instructorId: catalog.instructorId,
    currency,
    amount,
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
      courseId: catalog.courseId,
      currency,
      amount,
      mode,
    },
  });
  logStripeEvent({
    message: "Created hosted Checkout Session",
    path: "/api/payments/create-checkout-session",
    userId: studentId === GUEST_STUDENT_ID ? null : studentId,
    details: {
      sessionId: session.id,
      orderId: order.id,
      courseId: catalog.courseId,
      currency,
      amount,
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
