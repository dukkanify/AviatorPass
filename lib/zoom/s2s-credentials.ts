import { getServerEnv } from "@/config/env";

/**
 * Server-to-Server OAuth credentials for Zoom REST only
 * (create / update / delete). Host ZAK comes from the meeting start_url
 * returned by those calls — this account does not expose user:read:zak.
 *
 * Never used to sign a Meeting SDK JWT. General App Client ID/Secret
 * (`ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`) stay on the JWT path.
 */
export function getZoomS2SCredentials(): {
  accountId: string;
  clientId: string;
  clientSecret: string;
} | null {
  const env = getServerEnv();
  const accountId = env.ZOOM_ACCOUNT_ID?.trim() || "";
  const clientId = env.ZOOM_S2S_CLIENT_ID?.trim() || "";
  const clientSecret = env.ZOOM_S2S_CLIENT_SECRET?.trim() || "";
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}
