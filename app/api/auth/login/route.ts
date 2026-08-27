import { NextResponse } from "next/server";

import { passwordLogin } from "@/services/auth/auth-service";
import { getRequestContext } from "@/services/auth/guards";
import { ensureCsrfToken } from "@/lib/security/cookies";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { passwordLoginSchema } from "@/utils/validation";
import { writeOpsLog } from "@/services/ops/logging-service";

export async function POST(request: Request) {
  await ensureCsrfToken();
  const blocked = await enforceMutatingApiSecurity(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = passwordLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await passwordLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    rememberMe: parsed.data.rememberMe,
    ctx: getRequestContext(request),
  });

  writeOpsLog({
    level: result.success ? "info" : "warn",
    category: "security",
    message: result.success ? "Password login succeeded" : `Password login failed: ${result.error}`,
    path: "/api/auth/login",
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
