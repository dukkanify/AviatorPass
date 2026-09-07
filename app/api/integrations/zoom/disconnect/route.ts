import { NextResponse } from "next/server";

import { authErrorResponse } from "@/services/auth/guards";
import { requireZoomInstructor } from "@/services/zoom/middleware";
import { disconnectZoomIntegration, getInstructorZoomStatus } from "@/services/zoom/oauth-service";

export async function POST() {
  try {
    const user = await requireZoomInstructor();
    await disconnectZoomIntegration(user.id);
    return NextResponse.json({
      success: true,
      data: getInstructorZoomStatus(user.id),
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
