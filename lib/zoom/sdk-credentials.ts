import { getServerEnv } from "@/config/env";

/**
 * General App Client ID / Client Secret for the Meeting SDK JWT.
 *
 * Official auth: https://developers.zoom.us/docs/meeting-sdk/auth/
 * `appKey` = Client ID. Sign HMAC-SHA256 with Client Secret.
 *
 * Server-to-Server OAuth (`grant_type=account_credentials` + ZOOM_ACCOUNT_ID)
 * is a different flow and is never used here.
 */
export function getZoomMeetingSdkCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const env = getServerEnv();
  const clientId = env.ZOOM_CLIENT_ID?.trim() || "";
  const clientSecret = env.ZOOM_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
