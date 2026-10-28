import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { requireAuth } from "@/services/auth/guards";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import {
  displayMeetingName,
  extractZoomMeetingNumber,
  extractZoomPassword,
  generateMeetingSdkSignature,
  resolveInAppMeetingMode,
} from "@/lib/zoom/meeting-sdk";
import {
  assertCallerMayReceiveInAppZoomSession,
  callerMayJoinAsZoomHost,
  fetchZoomHostZak,
  getPublicJoinInfo,
  zoomHostBlockedByAnotherLiveMeeting,
} from "@/services/classes/zoom-service";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      liveClassId?: string;
      meetingNumber?: string;
      joinUrl?: string;
      startUrl?: string | null;
      password?: string | null;
      isHost?: boolean;
      providerMode?: string | null;
    };

    const authz = assertCallerMayReceiveInAppZoomSession({
      userId: user.id,
      role: user.role,
      liveClassId: body.liveClassId,
      meetingNumber: extractZoomMeetingNumber(body.joinUrl, body.meetingNumber),
    });

    let meetingNumber = extractZoomMeetingNumber(body.joinUrl, body.meetingNumber);
    let password = extractZoomPassword(body.joinUrl, body.password);
    let startUrl = body.startUrl ?? null;
    let providerMode = body.providerMode ?? null;

    if (authz.liveClassId) {
      const serverJoin = getPublicJoinInfo(authz.liveClassId, authz.isHost);
      if (serverJoin) {
        meetingNumber =
          extractZoomMeetingNumber(serverJoin.joinUrl, serverJoin.zoomMeetingId) || meetingNumber;
        password = serverJoin.password || password;
        startUrl = authz.isHost ? serverJoin.startUrl : null;
        providerMode = serverJoin.providerMode || providerMode;
      }
    }

    const credentials = getZoomMeetingSdkCredentials();
    const mode = resolveInAppMeetingMode({
      providerMode,
      meetingNumber,
      hasSdkCredentials: Boolean(credentials),
    });

    // Students always join as themselves. Only the assigned instructor (or
    // academy staff) receives the host token, so several lectures can run at
    // once and attendees are still allowed to share.
    const mayHost =
      authz.isHost &&
      callerMayJoinAsZoomHost({
        userId: user.id,
        role: user.role,
        meetingNumber,
      });
    const hostBlocked =
      mayHost && meetingNumber
        ? await zoomHostBlockedByAnotherLiveMeeting(meetingNumber, user.id)
        : false;
    const zak =
      mayHost && !hostBlocked
        ? await fetchZoomHostZak({
            meetingNumber,
            startUrl,
            instructorUserId: user.id,
            forceRefreshStartUrl: true,
          })
        : null;
    // Host ZAK refresh may recreate the Zoom meeting when start_url ZAK is
    // expired and GET rotation is unavailable (S2S write without meeting:read).
    // Re-read join info so JWT mn/password match the live meeting.
    if (authz.liveClassId && mayHost) {
      const refreshedJoin = getPublicJoinInfo(authz.liveClassId, true);
      if (refreshedJoin) {
        meetingNumber =
          extractZoomMeetingNumber(refreshedJoin.joinUrl, refreshedJoin.zoomMeetingId) ||
          meetingNumber;
        password = refreshedJoin.password || password;
        startUrl = refreshedJoin.startUrl;
        providerMode = refreshedJoin.providerMode || providerMode;
      }
    }
    const role: 0 | 1 = zak ? 1 : 0;
    const signature =
      mode === "sdk" && credentials && meetingNumber
        ? generateMeetingSdkSignature({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            meetingNumber,
            role: 0,
          })
        : null;
    const hostSignature =
      signature && zak && credentials && meetingNumber
        ? generateMeetingSdkSignature({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            meetingNumber,
            role: 1,
          })
        : null;

    return NextResponse.json({
      success: true,
      data: {
        mode: signature ? "sdk" : "classroom",
        meetingNumber,
        password,
        userName: displayMeetingName(user),
        userEmail: user.email,
        signature,
        hostSignature,
        zak,
        role,
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
