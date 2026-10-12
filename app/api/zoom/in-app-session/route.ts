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

    // Every classroom joins as the signed-in person, not the shared Zoom host.
    // One Zoom user can only sit inside a single meeting; a host token would
    // block every other lecture scheduled at the same time.
    const zak: string | null = null;
    const role: 0 | 1 = 0;
    const signature =
      mode === "sdk" && credentials && meetingNumber
        ? generateMeetingSdkSignature({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            meetingNumber,
            role,
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
        zak,
        role,
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
