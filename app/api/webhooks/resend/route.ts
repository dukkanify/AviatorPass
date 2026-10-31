/**
 * Resend bounce / complaint webhook.
 * Verifies Svix signature when RESEND_WEBHOOK_SECRET is set.
 * Does not modify DNS or Resend API keys — consumes events only.
 */

import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/security/rate-limit";
import {
  processResendWebhookEvent,
  verifyResendWebhookSignature,
} from "@/services/email/resend-webhook";

export const dynamic = "force-dynamic";

function isProductionRuntime() {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`resend-webhook:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many webhook calls" }, { status: 429 });
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON" }, { status: 400 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() || "";
  const svixId = request.headers.get("svix-id") || request.headers.get("webhook-id") || "";
  const svixTimestamp =
    request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp") || "";
  const svixSignature =
    request.headers.get("svix-signature") || request.headers.get("webhook-signature") || "";

  if (secret) {
    const ok = verifyResendWebhookSignature({
      payload: rawBody,
      svixId,
      svixTimestamp,
      svixSignature,
      secret,
    });
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature" },
        { status: 401 },
      );
    }
  } else if (isProductionRuntime()) {
    return NextResponse.json(
      { success: false, error: "RESEND_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const eventType =
    (typeof payload.type === "string" && payload.type) ||
    (typeof payload.event === "string" && payload.event) ||
    "";
  const eventId =
    svixId ||
    (typeof payload.id === "string" && payload.id) ||
    (typeof (payload.data as { email_id?: string } | undefined)?.email_id === "string"
      ? String((payload.data as { email_id?: string }).email_id)
      : "") ||
    "";

  const result = processResendWebhookEvent({
    eventId,
    eventType,
    payload,
  });

  return NextResponse.json({
    success: true,
    data: result,
    error: null,
  });
}
