import { NextResponse } from "next/server";

import { authErrorResponse } from "@/services/auth/guards";
import { roleMayFollowReturnPath, sanitizeReturnPath } from "@/lib/security/safe-return-path";
import { isZoomOAuthConfigured } from "@/services/zoom/config";
import { requireZoomInstructor } from "@/services/zoom/middleware";
import { buildZoomAuthorizeUrl } from "@/services/zoom/oauth-service";

export async function GET(request: Request) {
  try {
    const user = await requireZoomInstructor();
    if (!isZoomOAuthConfigured()) {
      return NextResponse.json(
        { success: false, data: null, error: "Zoom OAuth is not configured" },
        { status: 503 },
      );
    }
    const requested = new URL(request.url).searchParams.get("returnTo");
    const safe = sanitizeReturnPath(requested);
    const returnTo =
      safe && roleMayFollowReturnPath(user.role, safe) ? safe : "/instructor/profile";
    const url = buildZoomAuthorizeUrl({ userId: user.id, returnTo });
    return NextResponse.redirect(url);
  } catch (error) {
    return authErrorResponse(error);
  }
}
