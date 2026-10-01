import { NextResponse } from "next/server";

import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import { fetchZoomHostZak } from "@/services/classes/zoom-service";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import {
  displayMeetingName,
  extractZoomMeetingNumber,
  extractZoomPassword,
  generateMeetingSdkSignature,
  resolveInAppMeetingMode,
  zakFromStartUrl,
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

    const role: 0 | 1 = body.isHost ? 1 : 0;
    const signature =
      mode === "sdk" && credentials && meetingNumber
        ? generateMeetingSdkSignature({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            meetingNumber,
            role,
          })
        : null;

    let zak: string | null = null;
    if (body.isHost && signature) {
      // Prefer a fresh ZAK. Stored start_url tokens expire and Zoom then
      // rejects the join with "Not support start meeting via tokens".
      zak = await fetchZoomHostZak(null, user.id);
      if (!zak) zak = zakFromStartUrl(body.startUrl);
    }

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
