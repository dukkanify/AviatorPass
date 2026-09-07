/**
 * Zoom General OAuth configuration — environment variables only.
 */

import { getServerEnv } from "@/config/env";
import { getBaseUrl } from "@/lib/site-origin";

export const ZOOM_OAUTH_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
export const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";
export const ZOOM_OAUTH_REVOKE_URL = "https://zoom.us/oauth/revoke";

/** Granular scopes for a Zoom General app (meeting write + profile). */
export const DEFAULT_ZOOM_OAUTH_SCOPES = [
  "user:read:user",
  "meeting:write:meeting",
  "meeting:read:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
  "meeting:read:list_meetings",
].join(" ");

export const ZOOM_PROFILE_CACHE_MS = 10 * 60 * 1000;
export const TOKEN_REFRESH_SKEW_MS = 90_000;

export function getZoomOAuthConfig() {
  const env = getServerEnv();
  const redirectUri =
    env.ZOOM_REDIRECT_URI?.trim() || `${getBaseUrl()}/api/integrations/zoom/callback`;
  const scopes = env.ZOOM_OAUTH_SCOPES?.trim() || DEFAULT_ZOOM_OAUTH_SCOPES;
  return {
    clientId: env.ZOOM_CLIENT_ID?.trim() || "",
    clientSecret: env.ZOOM_CLIENT_SECRET?.trim() || "",
    redirectUri,
    baseUrl: (env.ZOOM_BASE_URL?.trim() || "https://api.zoom.us/v2").replace(/\/$/, ""),
    scopes,
    secretToken: env.ZOOM_SECRET_TOKEN?.trim() || env.ZOOM_WEBHOOK_SECRET?.trim() || "",
    webhookSecret: env.ZOOM_WEBHOOK_SECRET?.trim() || env.ZOOM_SECRET_TOKEN?.trim() || "",
  };
}

export function isZoomOAuthConfigured(): boolean {
  try {
    const cfg = getZoomOAuthConfig();
    return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
  } catch {
    return false;
  }
}

export function zoomBasicAuthHeader(): string {
  const { clientId, clientSecret } = getZoomOAuthConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}
