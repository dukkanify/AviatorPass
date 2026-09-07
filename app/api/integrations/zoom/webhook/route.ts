import { NextResponse } from "next/server";

import { publicEnv } from "@/config/env";
import {
  handleZoomWebhookEvent,
  verifyZoomWebhookSignature,
  zoomUrlValidationResponse,
} from "@/services/zoom/webhook-service";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "POST, OPTIONS";

const WEBHOOK_HEADERS = {
  Allow: ALLOWED_METHODS,
  "Cache-Control": "no-store",
} as const;

function methodNotAllowed() {
  return NextResponse.json(
    { error: "Method not allowed", allowed: ["POST", "OPTIONS"] },
    { status: 405, headers: WEBHOOK_HEADERS },
  );
}

export function GET() {
  return methodNotAllowed();
}

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: WEBHOOK_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...WEBHOOK_HEADERS,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": "Content-Type, x-zm-signature, x-zm-request-timestamp",
    },
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: WEBHOOK_HEADERS });
  }

  if (payload.event === "endpoint.url_validation") {
    const nested = payload.payload as { plainToken?: string } | undefined;
    const plainToken = String(nested?.plainToken ?? payload.plainToken ?? "");
    if (!plainToken) {
      return NextResponse.json(
        { error: "plainToken required" },
        { status: 400, headers: WEBHOOK_HEADERS },
      );
    }
    return NextResponse.json(zoomUrlValidationResponse(plainToken), { headers: WEBHOOK_HEADERS });
  }

  const secretConfigured = Boolean(
    process.env.ZOOM_SECRET_TOKEN?.trim() || process.env.ZOOM_WEBHOOK_SECRET?.trim(),
  );
  const requireSig =
    secretConfigured ||
    publicEnv.NEXT_PUBLIC_APP_ENV === "production" ||
    process.env.NODE_ENV === "production";

  if (requireSig) {
    const timestamp = request.headers.get("x-zm-request-timestamp") || "";
    const signature = request.headers.get("x-zm-signature") || "";
    if (!signature || !verifyZoomWebhookSignature({ rawBody: raw, timestamp, signature })) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401, headers: WEBHOOK_HEADERS },
      );
    }
  }

  const result = await handleZoomWebhookEvent(payload);
  return NextResponse.json(
    { success: true, data: result, error: null },
    { headers: WEBHOOK_HEADERS },
  );
}
