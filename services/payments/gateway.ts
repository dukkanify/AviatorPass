/**
 * Payment gateway adapters — mock (default) + Stripe Checkout with dynamic price_data + Tamara.
 * Never stores raw card data (PCI-aware). Never passes payment_method_types.
 * Never uses Stripe Price or Product IDs. Tamara/Taly are selected via methodBrand.
 */

import Stripe from "stripe";

import { generateId, generateToken } from "@/lib/security/crypto";
import type { PaymentMethodBrand, PaymentProvider, PaymentRecord } from "@/types/payments";
import { PaymentError } from "@/services/payments/access";
import {
  getStripeClient,
  isStripeConfigured,
  STRIPE_API_VERSION,
} from "@/services/payments/stripe-client";
import { stripeCancelUrl, stripeSuccessUrl } from "@/services/stripe/config";
import { resolveCourseOffer } from "@/services/stripe/course-offer";
import {
  buildDynamicPriceDataLineItem,
  stripeCheckoutMetadata,
} from "@/services/stripe/price-data";
import { normalizeCheckoutCurrency } from "@/services/stripe/currency";
import { readPaymentsDb } from "@/services/payments/store";
import { publicAppOrigin } from "@/lib/site-origin";
import { TamaraGateway } from "@/services/payments/tamara-gateway";
import { TalyGateway } from "@/services/payments/taly-gateway";

export interface GatewayChargeInput {
  orderId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  methodBrand: PaymentMethodBrand;
  paymentToken?: string;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey: string;
  simulateFailure?: boolean;
  stripePriceId?: string;
  country?: string;
  locale?: string;
  courseId?: string;
  studentId?: string;
  instructorId?: string;
  courseSlug?: string;
  productName?: string;
  productDescription?: string;
  imageUrl?: string | null;
  phone?: string;
  billingAddress?: string;
}

export interface GatewayChargeResult {
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentRecord["status"];
  clientSecret: string | null;
  checkoutUrl: string | null;
  methodBrand: PaymentMethodBrand;
  paymentMethodSummary: string;
  rawProviderPayload: Record<string, unknown>;
  failureCode: string | null;
  failureMessage: string | null;
  checkoutSessionId: string | null;
  stripeCustomerId: string | null;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createPayment(input: GatewayChargeInput): Promise<GatewayChargeResult>;
  confirmWebhook(
    payload: string,
    signature: string | null,
  ): Promise<{
    providerPaymentId: string;
    status: PaymentRecord["status"];
    raw: Record<string, unknown>;
    eventType?: string;
    eventId?: string;
  }>;
}

function maskToken(token?: string): string {
  if (!token) return "••••";
  return `•••• ${token.slice(-4).toUpperCase()}`;
}

function appOrigin(): string {
  return publicAppOrigin();
}

function integrationIdentifier(): string {
  const suffix = generateToken(6)
    .replace(/[^a-zA-Z]/g, "x")
    .slice(0, 8)
    .padEnd(8, "a");
  return `aviatorpass${suffix}`;
}

class MockGateway implements PaymentGateway {
  readonly provider = "mock" as const;

  async createPayment(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    if (input.simulateFailure || input.paymentToken === "fail") {
      return {
        provider: "mock",
        providerPaymentId: `mock_fail_${generateId().slice(0, 10)}`,
        status: "failed",
        clientSecret: null,
        checkoutUrl: null,
        methodBrand: input.methodBrand,
        paymentMethodSummary: `${input.methodBrand.toUpperCase()} ${maskToken(input.paymentToken)}`,
        rawProviderPayload: { simulated: true, failed: true },
        failureCode: "card_declined",
        failureMessage: "The payment method was declined (simulated).",
        checkoutSessionId: null,
        stripeCustomerId: null,
      };
    }

    const providerPaymentId = `mock_pay_${generateId().slice(0, 12)}`;
    const provider: PaymentProvider =
      input.methodBrand === "tamara" ||
      input.methodBrand === "taly" ||
      input.methodBrand === "tabby"
        ? input.methodBrand
        : "mock";
    return {
      provider,
      providerPaymentId,
      status: "succeeded",
      clientSecret: `mock_secret_${generateToken(8)}`,
      checkoutUrl:
        provider === "tamara" || provider === "taly" || provider === "tabby"
          ? `https://checkout.mock.${provider}.example/${providerPaymentId}`
          : null,
      methodBrand: input.methodBrand,
      paymentMethodSummary:
        input.methodBrand === "tabby"
          ? "Tabby (تالي) · mock BNPL"
          : input.methodBrand === "tamara"
            ? "Tamara · mock BNPL"
            : input.methodBrand === "taly"
              ? "Taly · mock BNPL"
              : `${input.methodBrand.toUpperCase()} ${maskToken(input.paymentToken ?? "4242")}`,
      rawProviderPayload: {
        simulated: true,
        provider,
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
      },
      failureCode: null,
      failureMessage: null,
      checkoutSessionId: null,
      stripeCustomerId: null,
    };
  }

  async confirmWebhook(payload: string, signature: string | null) {
    if (signature && signature !== "mock_whsec") {
      throw new PaymentError("Invalid webhook signature", 401);
    }
    const data = JSON.parse(payload) as {
      providerPaymentId?: string;
      status?: PaymentRecord["status"];
      type?: string;
      id?: string;
    };
    return {
      providerPaymentId: data.providerPaymentId ?? "",
      status: data.status ?? "succeeded",
      raw: data as Record<string, unknown>,
      eventType: data.type,
      eventId: data.id,
    };
  }
}

class StripeGateway implements PaymentGateway {
  readonly provider = "stripe" as const;

  async createPayment(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    if (!isStripeConfigured()) {
      throw new PaymentError(
        "Stripe secret key is not configured. Set STRIPE_SECRET_KEY to enable Checkout.",
        503,
      );
    }

    const order = readPaymentsDb().orders.find((o) => o.id === input.orderId) ?? null;
    const item = order?.items[0];
    const courseId = input.courseId || item?.courseId || "";
    let offer = null as ReturnType<typeof resolveCourseOffer> | null;
    if (courseId) {
      try {
        offer = resolveCourseOffer({
          courseId,
          instructorId: input.instructorId ?? item?.instructorId,
          currency: input.currency,
          amount: input.amount,
        });
      } catch {
        offer = null;
      }
    }
    const currency = offer?.currency ?? normalizeCheckoutCurrency(input.currency);
    const amount = offer?.amount ?? Math.round(input.amount);
    const title = offer?.title || input.productName || item?.productName || "AviatorPass course";
    const description = offer?.description || input.productDescription || title;
    const instructorId = offer?.instructorId || input.instructorId || item?.instructorId || "";
    const courseSlug = offer?.courseSlug || input.courseSlug || courseId;
    const studentId = input.studentId || order?.studentId || "";

    const stripe = getStripeClient();
    const origin = appOrigin();
    const email = input.customerEmail.includes("@invalid.") ? undefined : input.customerEmail;
    const metadata = stripeCheckoutMetadata({
      courseId: offer?.courseId || courseId,
      studentId,
      instructorId,
      courseSlug,
      currency,
      amount,
      extra: {
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        purchaseFirst: "true",
      },
    });

    const lineOffer = offer ?? {
      courseId: courseId || input.orderId,
      courseSlug,
      title,
      description,
      imageUrl: input.imageUrl ?? null,
      instructorId,
      amount,
      currency,
      productId: item?.productId ?? null,
      pricingModel: item?.pricingModel ?? "one_time",
      course: null,
      product: null,
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [buildDynamicPriceDataLineItem(lineOffer, "payment")],
        customer_email: email || undefined,
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },
        name_collection: { individual: { enabled: true, optional: false } },
        customer_creation: "always",
        invoice_creation: { enabled: true },
        adaptive_pricing: { enabled: false },
        client_reference_id: input.orderId,
        success_url: input.successUrl ?? stripeSuccessUrl(origin),
        cancel_url: input.cancelUrl ?? stripeCancelUrl(origin),
        metadata,
        payment_intent_data: {
          metadata,
          ...(instructorId ? { transfer_group: `instructor:${instructorId}` } : {}),
        },
        integration_identifier: integrationIdentifier(),
        locale: "auto",
      } as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: input.idempotencyKey },
    );

    return {
      provider: "stripe",
      providerPaymentId: session.id,
      status: "requires_payment",
      clientSecret: null,
      checkoutUrl: session.url,
      methodBrand: input.methodBrand,
      paymentMethodSummary: "Stripe Checkout",
      rawProviderPayload: {
        sessionId: session.id,
        status: session.status,
        priceData: true,
        apiVersion: STRIPE_API_VERSION,
      },
      failureCode: null,
      failureMessage: null,
      checkoutSessionId: session.id,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    };
  }

  async confirmWebhook(payload: string, signature: string | null) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new PaymentError("Stripe webhook secret not configured", 503);
    }
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(payload, signature ?? "", secret);
    return {
      providerPaymentId: stripeObjectId(event.data.object),
      status: "processing" as PaymentRecord["status"],
      raw: event as unknown as Record<string, unknown>,
      eventType: event.type,
      eventId: event.id,
    };
  }
}

function stripeObjectId(object: unknown): string {
  if (object && typeof object === "object" && "id" in object && typeof object.id === "string") {
    return object.id;
  }
  return "";
}

export function getPaymentGateway(methodBrand?: PaymentMethodBrand): PaymentGateway {
  if (methodBrand === "tamara") return new TamaraGateway();
  if (methodBrand === "taly") return new TalyGateway();
  if (isStripeConfigured()) return new StripeGateway();
  return new MockGateway();
}
