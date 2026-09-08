/**
 * Tamara PaymentGateway — hosted checkout. StripeGateway is unchanged.
 */

import { PaymentError } from "@/services/payments/access";
import { assertBnplCurrency } from "@/services/payments/country-pricing";
import type {
  GatewayChargeInput,
  GatewayChargeResult,
  PaymentGateway,
} from "@/services/payments/gateway";
import { formatTamaraAmount } from "@/services/payments/money";
import { readPaymentsDb } from "@/services/payments/store";
import { createTamaraCheckoutSession } from "@/services/payments/tamara-client";
import {
  getTamaraBaseUrl,
  isTamaraConfigured,
  isTamaraCountry,
  tamaraCancelUrl,
  tamaraCity,
  tamaraFailureUrl,
  tamaraNationalPhone,
  tamaraNotificationUrl,
  tamaraSuccessUrl,
} from "@/services/payments/tamara-config";
import { logTamaraEvent } from "@/services/payments/tamara-logging";
import { publicAppOrigin } from "@/lib/site-origin";
import type { PaymentRecord } from "@/types/payments";

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Student", last: "AviatorPass" };
  if (parts.length === 1) return { first: parts[0]!, last: "AviatorPass" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function parseCity(address: string, country: string): string {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!.slice(0, 80);
  return tamaraCity(country);
}

export class TamaraGateway implements PaymentGateway {
  readonly provider = "tamara" as const;

  async createPayment(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    if (!isTamaraConfigured()) {
      throw new PaymentError(
        "Tamara is not configured. Set TAMARA_API_TOKEN to enable Tamara checkout.",
        503,
      );
    }

    const order = readPaymentsDb().orders.find((o) => o.id === input.orderId) ?? null;
    const item = order?.items[0];
    const country = (input.country || order?.billingCountry || "SA").toUpperCase();
    if (!isTamaraCountry(country)) {
      throw new PaymentError(
        `Tamara is not available in ${country}. Choose Stripe or a supported GCC country.`,
        400,
      );
    }

    const currency = (input.currency || order?.currency || "SAR").toUpperCase();
    assertBnplCurrency("tamara", country, currency);
    const major = formatTamaraAmount(input.amount, currency);
    const taxMajor = formatTamaraAmount(order?.taxAmount ?? 0, currency);
    const names = splitName(input.customerName || order?.billingName || "AviatorPass Student");
    const firstName = String(order?.metadata?.guestFirstName ?? names.first).trim() || names.first;
    const lastName = String(order?.metadata?.guestLastName ?? names.last).trim() || names.last;
    const phoneRaw = input.phone || String(order?.metadata?.guestPhone ?? "") || "";
    const phone = tamaraNationalPhone(phoneRaw || "50000000", country);
    const line1 = (input.billingAddress || order?.billingAddress || "Digital enrolment").slice(
      0,
      128,
    );
    const city = parseCity(line1, country);
    const origin = publicAppOrigin();
    const productName = input.productName || item?.productName || "AviatorPass course";
    const sku = String(item?.productId ?? order?.id ?? "ATPL").slice(0, 128);
    const address = {
      first_name: firstName,
      last_name: lastName,
      line1,
      city,
      country_code: country,
      phone_number: phone,
    };

    const body = {
      order_reference_id: input.orderId,
      order_number: order?.orderNumber ?? input.orderId,
      total_amount: { amount: major, currency },
      description: (input.productDescription || productName).slice(0, 256),
      country_code: country,
      payment_type: "PAY_BY_INSTALMENTS",
      instalments: 4,
      locale: "en_US",
      platform: "AviatorPass",
      items: [
        {
          reference_id: item?.productId ?? input.orderId,
          type: "Digital",
          name: productName.slice(0, 255),
          sku,
          quantity: 1,
          unit_price: { amount: major, currency },
          total_amount: { amount: major, currency },
          tax_amount: { amount: taxMajor, currency },
          discount_amount: { amount: 0, currency },
        },
      ],
      consumer: {
        first_name: firstName,
        last_name: lastName,
        email: input.customerEmail,
        phone_number: phone,
      },
      billing_address: address,
      shipping_address: address,
      tax_amount: { amount: taxMajor, currency },
      shipping_amount: { amount: 0, currency },
      merchant_url: {
        success: input.successUrl || tamaraSuccessUrl(input.orderId, origin),
        cancel: input.cancelUrl || tamaraCancelUrl(input.orderId, origin),
        failure: tamaraFailureUrl(input.orderId, origin),
        notification: tamaraNotificationUrl(origin),
      },
      additional_data: {
        delivery_method: "digital",
      },
    };

    logTamaraEvent({
      message: "Checkout creation",
      path: "/checkout",
      details: {
        orderId: input.orderId,
        country,
        currency,
        amount: input.amount,
        baseUrl: getTamaraBaseUrl(),
      },
    });

    const session = await createTamaraCheckoutSession(body, input.idempotencyKey);

    logTamaraEvent({
      message: "Checkout created",
      path: "/checkout",
      details: {
        orderId: input.orderId,
        tamaraOrderId: session.order_id,
        checkoutId: session.checkout_id ?? null,
        status: session.status ?? "new",
      },
    });

    return {
      provider: "tamara",
      providerPaymentId: session.order_id,
      status: "requires_payment",
      clientSecret: null,
      checkoutUrl: session.checkout_url,
      methodBrand: "tamara",
      paymentMethodSummary: "Tamara",
      rawProviderPayload: {
        orderId: session.order_id,
        checkoutId: session.checkout_id ?? null,
        checkoutUrl: session.checkout_url,
        status: session.status ?? "new",
        merchantOrderId: input.orderId,
      },
      failureCode: null,
      failureMessage: null,
      checkoutSessionId: session.checkout_id ?? session.order_id,
      stripeCustomerId: null,
    };
  }

  async confirmWebhook(payload: string, signature: string | null) {
    void signature;
    const data = JSON.parse(payload) as {
      order_id?: string;
      event_type?: string;
      order_reference_id?: string;
    };
    return {
      providerPaymentId: data.order_id ?? "",
      status: "processing" as PaymentRecord["status"],
      raw: data as Record<string, unknown>,
      eventType: data.event_type,
      eventId: data.order_id && data.event_type ? `${data.order_id}:${data.event_type}` : undefined,
    };
  }
}
