import { NextResponse } from "next/server";

import { authErrorResponse } from "@/services/auth/guards";
import { requireZoomInstructor } from "@/services/zoom/middleware";
import { syncInstructorMeetings } from "@/services/zoom/meeting-service";
import { getInstructorZoomStatus } from "@/services/zoom/oauth-service";
import { enqueueZoomJob } from "@/services/zoom/queue";

export async function POST() {
  try {
    const user = await requireZoomInstructor();
    enqueueZoomJob({
      type: "zoom.token.refresh",
      payload: { userId: user.id },
      processNow: false,
    });
    enqueueZoomJob({
      type: "zoom.sync",
      payload: { userId: user.id },
      processNow: false,
    });
    const sync = await syncInstructorMeetings(user.id);
    return NextResponse.json({
      success: true,
      data: {
        ...getInstructorZoomStatus(user.id),
        sync,
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
