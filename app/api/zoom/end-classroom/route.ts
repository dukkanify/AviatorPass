import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { requireAuth } from "@/services/auth/guards";
import {
  assertCallerMayReceiveInAppZoomSession,
  endHostClassroomSession,
} from "@/services/classes/zoom-service";

/**
 * Host-only: End Meeting for All on THIS AviatorPass classroom.
 * PUT-ends the Zoom instance, marks the local class completed, and clears
 * other stale local meetings on the shared platform host.
 * Students and non-hosts receive 403 — they cannot free the host.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      liveClassId?: string;
      meetingNumber?: string;
    };
    const liveClassId = typeof body.liveClassId === "string" ? body.liveClassId.trim() : "";
    if (!liveClassId) {
      return NextResponse.json(
        { success: false, data: null, error: "liveClassId is required" },
        { status: 400 },
      );
    }

    const authz = assertCallerMayReceiveInAppZoomSession({
      userId: user.id,
      role: user.role,
      liveClassId,
      meetingNumber: body.meetingNumber,
    });
    if (!authz.isHost) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: "Only the class host can end this meeting for everyone",
        },
        { status: 403 },
      );
    }

    const result = await endHostClassroomSession({
      liveClassId,
      instructorUserId: user.id,
      clearStaleSiblings: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        meetingNumber: result.meetingNumber,
        released: result.released,
        releaseDetail: result.releaseDetail,
        classCompleted: result.classCompleted,
        staleEnded: result.staleEnded,
        liveListReadable: result.liveListReadable,
        otherLiveMeetings: result.otherLiveMeetings,
        hostFree: result.released && result.otherLiveMeetings.length === 0,
        message: result.released
          ? "Class ended for everyone. The platform Zoom host is free for the next lecture."
          : "Could not confirm Zoom end for this meeting number. If Error 3000 persists, another live session may still hold the host.",
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
