import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/security/rate-limit";
import {
  ingestInboundEmail,
  InboundEmailError,
} from "@/services/communication/inbound-email-service";

export const dynamic = "force-dynamic";

function isProductionRuntime() {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

function authorized(request: Request): boolean {
  const secret =
    process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") || "";
  const alt = request.headers.get("x-webhook-secret") || "";
  if (!secret) return !isProductionRuntime();
  return header === `Bearer ${secret}` || alt === secret;
}

function unwrapPayload(body: Record<string, unknown>) {
  const data =
    body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : body;
  return {
    from: data.from ?? body.from,
    to: data.to ?? body.to,
    cc: data.cc ?? body.cc,
    subject: data.subject ?? body.subject,
    text: data.text ?? body.text,
    html: data.html ?? body.html,
  };
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`inbound-email:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many webhook calls" }, { status: 429 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const result = await ingestInboundEmail(unwrapPayload(body));
    return NextResponse.json({ success: true, data: result, error: null });
  } catch (error) {
    if (error instanceof InboundEmailError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Inbound email failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
