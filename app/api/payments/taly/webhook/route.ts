import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { logTalyEvent } from "@/services/payments/taly-logging";
import { extractTalySignature } from "@/services/payments/taly-signature";
import { processTalyWebhook } from "@/services/payments/taly-webhook-service";

export const dynamic = "force-dynamic";

const ALLOW = { Allow: "POST, OPTIONS", "Cache-Control": "no-store" } as const;

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed", allowed: ["POST", "OPTIONS"] },
    { status: 405, headers: ALLOW },
  );
}

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: ALLOW });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ALLOW });
}

export async function POST(request: Request) {
  try {
    ensurePaymentsSeeded();
    const payload = await request.text();
    const signature = extractTalySignature(request);
    const result = await processTalyWebhook(payload, signature);
    return NextResponse.json(
      { success: true, data: result, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logTalyEvent({
      level: "error",
      message: "Taly webhook rejected",
      path: "/api/payments/taly/webhook",
      details: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return paymentErrorResponse(error);
  }
}
