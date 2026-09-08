import { NextResponse } from "next/server";

import { getBaseUrl } from "@/lib/site-origin";
import { completeZoomOAuthCallback } from "@/services/zoom/oauth-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await completeZoomOAuthCallback({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
  });
  const dest = new URL(result.redirectTo, getBaseUrl());
  return NextResponse.redirect(dest);
}
