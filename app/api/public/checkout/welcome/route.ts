import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  getWelcomeByOrderId,
  getWelcomeBySessionId,
} from "@/services/payments/purchase-first-service";
import { isStripeConfigured, getStripeClient } from "@/services/payments/stripe-client";
import { fulfillStripeCheckoutSession } from "@/services/payments/stripe-webhook-service";

export async function GET(request: Request) {
  try {
    await ensureCsrfToken();
    ensurePaymentsSeeded();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id") ?? searchParams.get("sessionId");
    const orderId = searchParams.get("orderId");
    if (!sessionId && !orderId) {
      return NextResponse.json(
        { success: false, data: null, error: "Missing checkout session" },
        { status: 400 },
      );
    }

    let snapshot = sessionId
      ? getWelcomeBySessionId(sessionId)
      : orderId
        ? getWelcomeByOrderId(orderId)
        : null;

    if (!snapshot && sessionId && sessionId.startsWith("cs_") && isStripeConfigured()) {
      const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" || session.status === "complete") {
        await fulfillStripeCheckoutSession(session);
        snapshot = getWelcomeBySessionId(sessionId);
      }
    }

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: "We could not find this checkout session yet. Refresh in a moment.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: snapshot, error: null });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
