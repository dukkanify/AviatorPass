import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { listZoomAccountUsers } from "@/services/zoom/oauth-service";

/** Super Admin: list Zoom account users available for instructor hosting (no tokens). */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const users = await listZoomAccountUsers();
    return NextResponse.json({
      success: true,
      data: { users },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
