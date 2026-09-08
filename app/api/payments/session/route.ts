import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { getPublicCheckoutSession } from "@/services/stripe/sessions";
import { getPublicTamaraSession } from "@/services/payments/tamara-sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
    const data = sessionId.trim().startsWith("cs_")
      ? await getPublicCheckoutSession(sessionId)
      : getPublicTamaraSession(sessionId);
    return NextResponse.json(
      { success: true, data, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
