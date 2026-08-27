import { NextResponse } from "next/server";

import { changePassword } from "@/services/auth/auth-service";
import { getRequestContext, requireAuth } from "@/services/auth/guards";
import { ensureCsrfToken } from "@/lib/security/cookies";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { changePasswordSchema } from "@/utils/validation";

export async function POST(request: Request) {
  await ensureCsrfToken();
  const blocked = await enforceMutatingApiSecurity(request);
  if (blocked) return blocked;

  const user = await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await changePassword({
    userId: user.id,
    currentPassword: parsed.data.currentPassword,
    password: parsed.data.password,
    ctx: getRequestContext(request),
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
