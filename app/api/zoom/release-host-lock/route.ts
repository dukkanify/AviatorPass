import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { requireAuth } from "@/services/auth/guards";
import {
  assertCallerMayReceiveInAppZoomSession,
  releaseHostLockForLiveClass,
} from "@/services/classes/zoom-service";

/**
 * Host-only recovery after Meeting SDK Error 3000.
 * Ends only THIS class meeting instance — never other customer meetings.
 * Does not rotate CEO / S2S credentials.
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
        { success: false, data: null, error: "Only the class host can release this Zoom lock" },
        { status: 403 },
      );
    }

    const result = await releaseHostLockForLiveClass({
      liveClassId,
      instructorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        meetingNumber: result.meetingNumber,
        released: Boolean(result.release?.released),
        releaseDetail: result.release?.detail ?? null,
        releaseStatus: result.release?.status ?? null,
        liveListReadable: result.liveListReadable,
        liveListErrors: result.liveListErrors,
        otherLiveMeetings: result.otherLiveMeetings,
        rootCauseHint: !result.liveListReadable
          ? "Zoom live meeting list is not readable with the current Server-to-Server token (often missing meeting:read). Empty clear-live results are not proof that the host is free. Meeting SDK Error 3000 remains authoritative."
          : result.otherLiveMeetings.length
            ? "Another Zoom meeting is live on the platform host. AviatorPass did not end those meetings. Leave them in Zoom or use Super Admin clear-live for confirmed ghosts only."
            : result.release?.released
              ? "This class meeting instance was ended so the host can start again."
              : "No live instance was ended for this meeting number.",
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
