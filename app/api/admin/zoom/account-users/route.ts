import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { listZoomAccountUsers } from "@/services/zoom/oauth-service";

/** Super Admin: list Zoom account users available for instructor hosting (no tokens). */
export async function GET(request: Request) {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const url = new URL(request.url);
    const emails = (url.searchParams.get("emails") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const users = await listZoomAccountUsers(emails);
    return NextResponse.json({
      success: true,
      data: { users },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
