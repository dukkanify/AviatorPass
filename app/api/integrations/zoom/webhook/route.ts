import { NextResponse } from "next/server";

import { publicEnv } from "@/config/env";
import {
  handleZoomWebhookEvent,
  verifyZoomWebhookSignature,
  zoomUrlValidationResponse,
} from "@/services/zoom/webhook-service";

export async function POST(request: Request) {
  const raw = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.event === "endpoint.url_validation") {
    const nested = payload.payload as { plainToken?: string } | undefined;
    const plainToken = String(nested?.plainToken ?? payload.plainToken ?? "");
    if (!plainToken) {
      return NextResponse.json({ error: "plainToken required" }, { status: 400 });
    }
    return NextResponse.json(zoomUrlValidationResponse(plainToken));
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
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const result = await handleZoomWebhookEvent(payload);
  return NextResponse.json({ success: true, data: result, error: null });
}
