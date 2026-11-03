import { NextResponse } from "next/server";

import { authErrorResponse } from "@/services/auth/guards";
import { zoomCredsPresent } from "@/services/classes/zoom-service";
import { requireZoomInstructor } from "@/services/zoom/middleware";
import { getInstructorZoomStatus } from "@/services/zoom/oauth-service";

export async function GET() {
  try {
    const user = await requireZoomInstructor();
    return NextResponse.json({
      success: true,
      data: {
        ...getInstructorZoomStatus(user.id),
        /** Centralized CEO/platform S2S hosting — personal Connect Zoom optional. */
        platformHostingReady: zoomCredsPresent(),
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
