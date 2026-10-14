import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { delegateConnectInstructorZoom } from "@/services/zoom/oauth-service";

/**
 * Super Admin: link an instructor to a Zoom account user via S2S so live classes
 * host on that user instead of the shared platform host. Tokens stay server-side.
 */
export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const body = (await request.json().catch(() => ({}))) as {
      instructorId?: string;
      zoomUserEmail?: string;
    };
    if (!body.instructorId?.trim() || !body.zoomUserEmail?.trim()) {
      return NextResponse.json(
        { success: false, data: null, error: "instructorId and zoomUserEmail are required" },
        { status: 400 },
      );
    }
    const data = await delegateConnectInstructorZoom({
      instructorId: body.instructorId.trim(),
      zoomUserEmail: body.zoomUserEmail.trim(),
      actorId: actor.id,
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return classErrorResponse(error);
  }
}
