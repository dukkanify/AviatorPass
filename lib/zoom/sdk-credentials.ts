import { getServerEnv } from "@/config/env";

/**
 * Meeting SDK credentials from the Zoom General App.
 *
 * Official flow: Marketplace → General App → Features → Embed → Meeting SDK,
 * then Client ID / Client Secret from Basic Information.
 * https://developers.zoom.us/docs/meeting-sdk/get-credentials/
 * https://developers.zoom.us/docs/meeting-sdk/auth/
 *
 * Stored as ZOOM_SDK_KEY / ZOOM_SDK_SECRET (aliases: ZOOM_MEETING_SDK_KEY / SECRET).
 * Never reuse Server-to-Server OAuth Client ID/Secret — those only create/update/delete.
 */
export function getZoomMeetingSdkCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const env = getServerEnv();
  const clientId = env.ZOOM_SDK_KEY?.trim() || env.ZOOM_MEETING_SDK_KEY?.trim() || "";
  const clientSecret = env.ZOOM_SDK_SECRET?.trim() || env.ZOOM_MEETING_SDK_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
