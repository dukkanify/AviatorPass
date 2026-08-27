import { NextResponse } from "next/server";

import { consumePasswordSetupToken } from "@/services/auth/password-setup-service";
import { ensureCsrfToken } from "@/lib/security/cookies";
import { setupPasswordSchema } from "@/utils/validation";

export async function POST(request: Request) {
  await ensureCsrfToken();
  const body = await request.json().catch(() => null);
  const parsed = setupPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await consumePasswordSetupToken({
    email: parsed.data.email,
    token: parsed.data.token,
    password: parsed.data.password,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
