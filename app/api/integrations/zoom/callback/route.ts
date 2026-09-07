import { NextResponse } from "next/server";

import { publicEnv } from "@/config/env";
import { completeZoomOAuthCallback } from "@/services/zoom/oauth-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await completeZoomOAuthCallback({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
  });
  const dest = new URL(result.redirectTo, publicEnv.NEXT_PUBLIC_APP_URL);
  return NextResponse.redirect(dest);
}
