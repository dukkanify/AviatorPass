import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { processStripeWebhook } from "@/services/stripe/webhook";

export const dynamic = "force-dynamic";

/** Legacy alias — production endpoint is POST /api/payments/webhook */
export async function POST(request: Request) {
  try {
    ensurePaymentsSeeded();
    const payload = await request.text();
    const signature =
      request.headers.get("stripe-signature") ?? request.headers.get("x-aep-webhook-signature");
    const result = await processStripeWebhook(payload, signature);
    return NextResponse.json({ success: true, data: result, error: null });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
