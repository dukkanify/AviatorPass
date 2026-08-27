import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getWelcomeBySessionId } from "@/services/payments/purchase-first-service";

export async function GET(request: Request) {
  try {
    await ensureCsrfToken();
    ensurePaymentsSeeded();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id") ?? searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { success: false, data: null, error: "Missing checkout session" },
        { status: 400 },
      );
    }
    const snapshot = getWelcomeBySessionId(sessionId);
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
