import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { getOrder } from "@/services/payments/checkout-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  payGuestCheckout,
  publicOrderSnapshot,
  quotePublicCheckout,
} from "@/services/payments/purchase-first-service";
import { COUNTRIES } from "@/constants/countries";
import { guestCheckoutSchema } from "@/utils/validation";

export async function GET(request: Request) {
  try {
    await ensureCsrfToken();
    ensurePaymentsSeeded();
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");
    if (orderId) {
      const order = getOrder(orderId);
      if (!order || !order.metadata?.purchaseFirst) {
        return NextResponse.json(
          { success: false, data: null, error: "Order not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: publicOrderSnapshot(order),
        error: null,
      });
    }

    const productId = searchParams.get("productId");
    const country = searchParams.get("country");
    const locale = searchParams.get("locale") ?? request.headers.get("accept-language");
    const geo =
      request.headers.get("cf-ipcountry") ??
      request.headers.get("x-vercel-ip-country") ??
      request.headers.get("x-country-code");
    const quote = await quotePublicCheckout({ productId, country, locale, geoCountry: geo });
    return NextResponse.json({
      success: true,
      data: {
        ...quote,
        countries: COUNTRIES.filter((c) => c.active).map((c) => ({
          code: c.code,
          name: c.name,
          dialCode: c.dialCode,
        })),
      },
      error: null,
    });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureCsrfToken();
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    ensurePaymentsSeeded();
    const body = await request.json().catch(() => null);
    const parsed = guestCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? "Invalid checkout",
        },
        { status: 400 },
      );
    }

    const result = await payGuestCheckout(parsed.data);
    const failed = result.order.status === "failed";
    return NextResponse.json(
      {
        success: !failed,
        data: {
          ...result,
          order: publicOrderSnapshot(result.order),
          redirectTo: result.order.status === "paid" ? `/welcome?orderId=${result.order.id}` : null,
          payment: result.payment
            ? {
                id: result.payment.id,
                status: result.payment.status,
                methodBrand: result.payment.methodBrand,
                paymentMethodSummary: result.payment.paymentMethodSummary,
                checkoutUrl: result.payment.checkoutUrl,
              }
            : null,
        },
        error: failed ? result.order.failureReason : null,
      },
      { status: failed ? 402 : 200 },
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
