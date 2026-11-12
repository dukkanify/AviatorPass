import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { getCurrentSession } from "@/services/auth/auth-service";
import { payOrder } from "@/services/payments/checkout-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { payGuestCheckout, publicOrderSnapshot } from "@/services/payments/purchase-first-service";
import { isTalyConfigured } from "@/services/payments/taly-config";
import { logTalyEvent } from "@/services/payments/taly-logging";
import { guestCheckoutSchema } from "@/utils/validation";
import type { PaymentMethodBrand } from "@/types/payments";

export const dynamic = "force-dynamic";

const ALLOW = { Allow: "POST, OPTIONS", "Cache-Control": "no-store" } as const;

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed", allowed: ["POST", "OPTIONS"] },
    { status: 405, headers: ALLOW },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ALLOW });
}

export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    ensurePaymentsSeeded();
    if (!isTalyConfigured()) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: "Taly is not configured. Set TALY_API_KEY and TALY_SECRET_KEY.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, data: null, error: "JSON body required" },
        { status: 400 },
      );
    }

    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (orderId) {
      const session = await getCurrentSession();
      if (!session.user) {
        return NextResponse.json(
          { success: false, data: null, error: "Sign in to pay an existing order with Taly" },
          { status: 401 },
        );
      }
      const result = await payOrder({
        user: session.user,
        orderId,
        methodBrand: "taly",
        paymentMode: "taly",
      });
      return NextResponse.json({
        success: true,
        data: {
          orderId: result.order.id,
          orderNumber: result.order.orderNumber,
          checkoutUrl: result.payment.checkoutUrl,
          orderToken: result.payment.checkoutSessionId,
          talyOrderId: result.payment.providerPaymentId,
          status: result.payment.status,
        },
        error: null,
      });
    }

    const parsed = guestCheckoutSchema.safeParse({ ...body, methodBrand: "taly" });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? "Invalid Taly checkout",
        },
        { status: 400 },
      );
    }

    const result = await payGuestCheckout({
      ...parsed.data,
      methodBrand: "taly" as PaymentMethodBrand,
    });
    const failed = result.order.status === "failed";
    return NextResponse.json(
      {
        success: !failed,
        data: {
          ...result,
          order: publicOrderSnapshot(result.order),
          checkoutUrl: result.checkoutUrl ?? result.payment?.checkoutUrl ?? null,
          orderToken: result.payment?.checkoutSessionId ?? null,
          talyOrderId: result.payment?.providerPaymentId ?? null,
        },
        error: failed ? result.order.failureReason : null,
      },
      { status: failed ? 402 : 200 },
    );
  } catch (error) {
    logTalyEvent({
      level: "error",
      message: "create-order failed",
      path: "/api/payments/taly/create-order",
      details: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return paymentErrorResponse(error);
  }
}
