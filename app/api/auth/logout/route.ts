import { NextResponse } from "next/server";

import { signOut } from "@/services/auth/auth-service";
import { getRequestContext } from "@/services/auth/guards";
import { applyExpiredAuthCookies, ensureCsrfToken } from "@/lib/security/cookies";

export async function POST(request: Request) {
  await ensureCsrfToken();
  const result = await signOut(getRequestContext(request));
  return applyExpiredAuthCookies(NextResponse.json(result));
}
