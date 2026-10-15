/**
 * Zoom General OAuth configuration — environment variables only.
 */

import { getServerEnv } from "@/config/env";
import { getBaseUrl, PRODUCTION_SITE_URL } from "@/lib/site-origin";

export const ZOOM_OAUTH_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
export const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";
export const ZOOM_OAUTH_REVOKE_URL = "https://zoom.us/oauth/revoke";

/** Canonical production instructor OAuth callback — must match Marketplace allow list exactly. */
export const PRODUCTION_ZOOM_OAUTH_REDIRECT_URI = `${PRODUCTION_SITE_URL}/api/integrations/zoom/callback`;

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

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

/**
 * Resolve the OAuth redirect_uri sent to Zoom authorize + token exchange.
 * Production always uses the www canonical callback (apex redirects break OAuth).
 * Trailing slashes are stripped so Marketplace strict-mode matches stay stable.
 */
export function resolveZoomOAuthRedirectUri(configured?: string | null): string {
  const raw = (configured ?? "").trim().replace(/\/$/, "");
  if (isProductionRuntime()) {
    if (!raw) return PRODUCTION_ZOOM_OAUTH_REDIRECT_URI;
    // Apex host is normalized to www — browsers 308 apex→www and can drop OAuth params.
    if (raw === "https://aviatorpass.com/api/integrations/zoom/callback") {
      return PRODUCTION_ZOOM_OAUTH_REDIRECT_URI;
    }
    return raw;
  }
  return raw || `${getBaseUrl()}/api/integrations/zoom/callback`.replace(/\/$/, "");
}

/** Non-secret OAuth identity for Admin diagnostics (never includes secrets). */
export function getZoomOAuthPublicDiagnostics() {
  const cfg = getZoomOAuthConfig();
  const id = cfg.clientId;
  return {
    oauthConfigured: Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri),
    redirectUri: cfg.redirectUri,
    clientIdSuffix: id ? id.slice(-4) : null,
    clientIdLength: id ? id.length : 0,
    authorizeHost: "zoom.us",
  };
}

export function getZoomOAuthConfig() {
  const env = getServerEnv();
  const redirectUri = resolveZoomOAuthRedirectUri(env.ZOOM_REDIRECT_URI);
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
