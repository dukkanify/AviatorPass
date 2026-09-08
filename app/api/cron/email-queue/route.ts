import { NextResponse } from "next/server";

import { processEmailQueue } from "@/services/email/queue";
import { logEmailEvent } from "@/services/email/email-log";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") || "";
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) return true;
  if (secret && header === `Bearer ${secret}`) return true;
  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await processEmailQueue(15);
  logEmailEvent("webhook_trigger", { source: "cron.email-queue", ...result });
  return NextResponse.json({ success: true, data: result, error: null });
}

export async function POST(request: Request) {
  return GET(request);
}
