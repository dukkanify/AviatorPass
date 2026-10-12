import { NextResponse } from "next/server";

import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import {
  displayMeetingName,
  extractZoomMeetingNumber,
  extractZoomPassword,
  generateMeetingSdkSignature,
  resolveInAppMeetingMode,
} from "@/lib/zoom/meeting-sdk";
import { callerMayJoinAsZoomHost, fetchZoomHostZak } from "@/services/classes/zoom-service";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      meetingNumber?: string;
      joinUrl?: string;
      startUrl?: string | null;
      password?: string | null;
      isHost?: boolean;
      providerMode?: string | null;
    };

    const meetingNumber = extractZoomMeetingNumber(body.joinUrl, body.meetingNumber);
    const password = extractZoomPassword(body.joinUrl, body.password);
    const credentials = getZoomMeetingSdkCredentials();
    const mode = resolveInAppMeetingMode({
      providerMode: body.providerMode,
      meetingNumber,
      hasSdkCredentials: Boolean(credentials),
    });

    // Students always join as themselves. Only the assigned instructor (or
    // academy staff) receives the host token, so several lectures can run at
    // once and attendees are still allowed to share.
    const mayHost =
      Boolean(body.isHost) &&
      callerMayJoinAsZoomHost({
        userId: user.id,
        role: user.role,
        meetingNumber,
      });
    const zak = mayHost
      ? await fetchZoomHostZak({
          meetingNumber,
          startUrl: body.startUrl,
          instructorUserId: user.id,
        })
      : null;
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
    return authErrorResponse(error);
  }
}
