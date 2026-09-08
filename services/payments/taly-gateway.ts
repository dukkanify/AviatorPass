/**
 * Taly PaymentGateway — hosted checkout. StripeGateway and TamaraGateway are unchanged.
 */

import { PaymentError } from "@/services/payments/access";
import type {
  GatewayChargeInput,
  GatewayChargeResult,
  PaymentGateway,
} from "@/services/payments/gateway";
import { formatTamaraAmount } from "@/services/payments/money";
import { readPaymentsDb } from "@/services/payments/store";
import { getTalyOrder, initiateTalyOrder } from "@/services/payments/taly-client";
import {
  getTalyBaseUrl,
  isTalyConfigured,
  talyCancelUrl,
  talyDialCode,
  talyNationalPhone,
  talyNotificationUrl,
  talySuccessUrl,
} from "@/services/payments/taly-config";
import { logTalyEvent } from "@/services/payments/taly-logging";
import { publicAppOrigin } from "@/lib/site-origin";
import type { PaymentRecord } from "@/types/payments";

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Student", last: "AviatorPass" };
  if (parts.length === 1) return { first: parts[0]!, last: "AviatorPass" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function majorAmount(amount: number, currency: string): number {
  return formatTamaraAmount(amount, currency);
}

function itemArabicName(name: string): string {
  return name.slice(0, 255) || "AviatorPass";
}

export function mapTalyOrderStatus(raw: string | undefined | null): {
  payment: PaymentRecord["status"] | "cancelled";
  order: "pending" | "paid" | "failed" | "cancelled" | "refunded" | null;
  action: "approve" | "pending" | "fail" | "cancel" | "refund" | "ignore";
} {
  const status = (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    status === "CONFIRMED" ||
    status === "APPROVED" ||
    status === "SUCCESS" ||
    status === "COMPLETE" ||
    status === "COMPLETED" ||
    status === "PAID"
  ) {
    return { payment: "succeeded", order: "paid", action: "approve" };
  }
  if (status === "INITIATED" || status === "PENDING" || status === "PROCESSING") {
    return { payment: "processing", order: "pending", action: "pending" };
  }
  if (
    status === "REJECTED" ||
    status === "FAILED" ||
    status === "FAILURE" ||
    status === "DECLINED"
  ) {
    return { payment: "failed", order: "failed", action: "fail" };
  }
  if (status === "CANCELLED" || status === "CANCELED" || status === "CANCEL") {
    return { payment: "failed", order: "cancelled", action: "cancel" };
  }
  if (status === "REFUNDED" || status === "FULLY_REFUNDED") {
    return { payment: "refunded", order: "refunded", action: "refund" };
  }
  if (status === "PARTIALLY_REFUNDED" || status === "PARTIAL_REFUND") {
    return { payment: "partially_refunded", order: null, action: "refund" };
  }
  return { payment: "processing", order: null, action: "ignore" };
}

export class TalyGateway implements PaymentGateway {
  readonly provider = "taly" as const;

  async createPayment(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    if (!isTalyConfigured()) {
      throw new PaymentError(
        "Taly is not configured. Set TALY_API_KEY and TALY_SECRET_KEY to enable Taly checkout.",
        503,
      );
    }

    const order = readPaymentsDb().orders.find((o) => o.id === input.orderId) ?? null;
    const item = order?.items[0];
    const country = (input.country || order?.billingCountry || "KW").toUpperCase();
    const currency = (input.currency || order?.currency || "KWD").toUpperCase();
    const total = majorAmount(input.amount, currency);
    const tax = majorAmount(order?.taxAmount ?? 0, currency);
    const discount = majorAmount(order?.discountAmount ?? 0, currency);
    const names = splitName(input.customerName || order?.billingName || "AviatorPass Student");
    const firstName = String(order?.metadata?.guestFirstName ?? names.first).trim() || names.first;
    const lastName = String(order?.metadata?.guestLastName ?? names.last).trim() || names.last;
    const phoneRaw = input.phone || String(order?.metadata?.guestPhone ?? "") || "";
    const phone = talyNationalPhone(phoneRaw || "55555333", country);
    const origin = publicAppOrigin();
    const productName = (input.productName || item?.productName || "AviatorPass course").slice(
      0,
      255,
    );
    const sku = String(item?.productId ?? order?.id ?? "ATPL").slice(0, 128);
    const successUrl = input.successUrl || talySuccessUrl(input.orderId, origin);

    const body = {
      merchantOrderId: input.orderId,
      language: "en",
      subTotal: total,
      totalAmount: total,
      currency,
      discountAmount: discount,
      taxAmount: tax,
      deliveryAmount: 0,
      deliveryMethod: "digital",
      otherFee: 0,
      merchantRedirectUrl: successUrl,
      postBackUrl: talyNotificationUrl(origin),
      platform: "website",
      customerDetails: {
        firstName: firstName.slice(0, 80),
        lastName: lastName.slice(0, 80),
        countryCode: talyDialCode(country),
        phoneNumber: phone,
        customerEmail: input.customerEmail,
      },
      orderItems: [
        {
          sku,
          type: "digital",
          name: productName,
          nameArabic: itemArabicName(productName),
          itemDescription: (input.productDescription || productName).slice(0, 255),
          quantity: 1,
          itemPrice: total,
          itemBrand: "AviatorPass",
          itemCategory: "Education > Aviation",
        },
      ],
    };

    logTalyEvent({
      message: "Checkout creation",
      path: "/api/payments/taly/create-order",
      details: {
        orderId: input.orderId,
        country,
        currency,
        amount: input.amount,
        baseUrl: getTalyBaseUrl(),
      },
    });

    let session;
    try {
      session = await initiateTalyOrder(body);
    } catch (error) {
      const duplicate =
        error instanceof PaymentError &&
        (error.status === 409 || /merchantOrderId already exist/i.test(error.message));
      if (!duplicate) throw error;
      const existing = await getTalyOrder(input.orderId);
      const checkoutUrl = String(existing.secureCheckoutUrl ?? "");
      const orderToken = String(existing.orderToken ?? "");
      if (!checkoutUrl || !orderToken) throw error;
      session = {
        talyOrderId: existing.talyOrderId ?? input.orderId,
        orderToken,
        secureCheckoutUrl: checkoutUrl,
        orderStatus: String(existing.orderStatus ?? "INITIATED"),
      };
    }

    logTalyEvent({
      message: "Checkout created",
      path: "/api/payments/taly/create-order",
      details: {
        orderId: input.orderId,
        talyOrderId: session.talyOrderId,
        orderStatus: session.orderStatus ?? "INITIATED",
      },
    });

    const providerPaymentId = String(session.talyOrderId ?? session.orderToken);

    return {
      provider: "taly",
      providerPaymentId,
      status: "requires_payment",
      clientSecret: null,
      checkoutUrl: session.secureCheckoutUrl,
      methodBrand: "taly",
      paymentMethodSummary: "Taly",
      rawProviderPayload: {
        talyOrderId: session.talyOrderId,
        orderToken: session.orderToken,
        checkoutUrl: session.secureCheckoutUrl,
        status: session.orderStatus ?? "INITIATED",
        merchantOrderId: input.orderId,
        cancelUrl: input.cancelUrl || talyCancelUrl(input.orderId, origin),
      },
      failureCode: null,
      failureMessage: null,
      checkoutSessionId: session.orderToken,
      stripeCustomerId: null,
    };
  }

  async confirmWebhook(payload: string, signature: string | null) {
    void signature;
    const data = JSON.parse(payload) as {
      orderToken?: string;
      merchantOrderId?: string;
      orderStatus?: string;
      orderDate?: string;
    };
    const mapped = mapTalyOrderStatus(data.orderStatus);
    return {
      providerPaymentId: data.orderToken ?? "",
      status: mapped.payment === "cancelled" ? "failed" : mapped.payment,
      raw: data as Record<string, unknown>,
      eventType: data.orderStatus,
      eventId:
        data.orderToken && data.orderStatus
          ? `${data.orderToken}:${data.orderStatus}:${data.orderDate ?? ""}`
          : undefined,
    };
  }
}
