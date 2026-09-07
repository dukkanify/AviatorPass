import { NextResponse } from "next/server";

import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { getCurrentSession } from "@/services/auth/auth-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { createCheckoutSession } from "@/services/stripe/checkout";
import { logStripeEvent } from "@/services/stripe/logging";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed", allowed: ["POST", "OPTIONS"] },
    { status: 405, headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    ensurePaymentsSeeded();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, data: null, error: "JSON body required" },
        { status: 400 },
      );
    }

    const session = await getCurrentSession();
    const studentId =
      (typeof body.studentId === "string" && body.studentId) || session.user?.id || null;

    const result = await createCheckoutSession({
      courseId: String(body.courseId ?? ""),
      studentId,
      instructorId: typeof body.instructorId === "string" ? body.instructorId : null,
      currency: String(body.currency ?? ""),
      amount: typeof body.amount === "number" ? body.amount : null,
      email: typeof body.email === "string" ? body.email : session.user?.email,
      customerName:
        typeof body.customerName === "string" ? body.customerName : session.user?.fullName || null,
      country: typeof body.country === "string" ? body.country : null,
      locale: typeof body.locale === "string" ? body.locale : null,
      mode: body.mode === "subscription" ? "subscription" : "payment",
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        sessionId: result.sessionId,
        checkoutId: result.checkoutId,
        status: result.status,
      },
      error: null,
    });
  } catch (error) {
    logStripeEvent({
      level: "error",
      message: "create-checkout-session failed",
      path: "/api/payments/create-checkout-session",
      details: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return paymentErrorResponse(error);
  }
}
