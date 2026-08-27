import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { startHostedCheckout } from "@/services/payments/purchase-first-service";
import { checkoutSessionSchema } from "@/utils/validation";

export async function POST(request: Request) {
  try {
    await ensureCsrfToken();
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    ensurePaymentsSeeded();
    const body = await request.json().catch(() => ({}));
    const parsed = checkoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? "Invalid checkout",
        },
        { status: 400 },
      );
    }

    const geo =
      request.headers.get("cf-ipcountry") ??
      request.headers.get("x-vercel-ip-country") ??
      request.headers.get("x-country-code");
    const locale = parsed.data.locale ?? request.headers.get("accept-language");
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");

    const result = await startHostedCheckout({
      productId: parsed.data.productId,
      country: parsed.data.country,
      locale,
      geoCountry: geo,
      email: parsed.data.email,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, data: result, error: null });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
