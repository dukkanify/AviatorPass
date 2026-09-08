import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { getPublicCheckoutSession } from "@/services/stripe/sessions";
import { getPublicTamaraSession } from "@/services/payments/tamara-sessions";
import { getPublicTalySession } from "@/services/payments/taly-sessions";
import { listPayments } from "@/services/payments/checkout-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
    const trimmed = sessionId.trim();
    const hosted = listPayments().find(
      (p) =>
        p.provider === "taly" &&
        (p.providerPaymentId === trimmed ||
          p.checkoutSessionId === trimmed ||
          p.orderId === trimmed ||
          String(p.rawProviderPayload.orderToken ?? "") === trimmed ||
          String(p.rawProviderPayload.talyOrderId ?? "") === trimmed),
    );
    const data = trimmed.startsWith("cs_")
      ? await getPublicCheckoutSession(trimmed)
      : hosted
        ? getPublicTalySession(trimmed)
        : getPublicTamaraSession(trimmed);
    return NextResponse.json(
      { success: true, data, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
