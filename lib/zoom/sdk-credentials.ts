import { getServerEnv } from "@/config/env";

/**
 * Meeting SDK credentials from the Zoom General App (Features → Embed → Meeting SDK).
 *
 * `ZOOM_SDK_KEY` / `ZOOM_SDK_SECRET` store that app's Client ID and Client Secret.
 * Standalone Meeting SDK Key/Secret apps are deprecated. Never reuse Server-to-Server
 * OAuth Client ID/Secret here — those only create/update/delete meetings.
 */
export function getZoomMeetingSdkCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const env = getServerEnv();
  const clientId = env.ZOOM_SDK_KEY?.trim() || "";
  const clientSecret = env.ZOOM_SDK_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
