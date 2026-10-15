/**
 * Zoom configuration — Meeting SDK and Instructor OAuth are separate apps.
 */

import { getServerEnv } from "@/config/env";
import { getBaseUrl, PRODUCTION_SITE_URL } from "@/lib/site-origin";

export const ZOOM_OAUTH_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
export const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";
export const ZOOM_OAUTH_REVOKE_URL = "https://zoom.us/oauth/revoke";

/** Canonical production instructor OAuth callback — must match Marketplace allow list exactly. */
export const PRODUCTION_ZOOM_OAUTH_REDIRECT_URI = `${PRODUCTION_SITE_URL}/api/integrations/zoom/callback`;

/**
 * Minimum user-authorized granular scopes for instructor Connect Zoom:
 * read identity + create/read/update/delete meetings on that Zoom user.
 * `meeting:read:list_meetings` omitted by default — often missing on new General apps
 * and triggers Zoom "Invalid scope" when requested.
 */
export const DEFAULT_ZOOM_OAUTH_SCOPES = [
  "user:read:user",
  "meeting:write:meeting",
  "meeting:read:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
].join(" ");

/** Previously requested; rejected when not enabled on the Instructor OAuth app. */
export const OPTIONAL_ZOOM_OAUTH_SCOPES = ["meeting:read:list_meetings"] as const;

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
    if (raw === "https://aviatorpass.com/api/integrations/zoom/callback") {
      return PRODUCTION_ZOOM_OAUTH_REDIRECT_URI;
    }
    return raw;
  }
  return raw || `${getBaseUrl()}/api/integrations/zoom/callback`.replace(/\/$/, "");
}

function suffix(id: string): string | null {
  return id ? id.slice(-4) : null;
}

/** Non-secret OAuth + SDK identity for Admin diagnostics (never includes secrets). */
export function getZoomOAuthPublicDiagnostics() {
  const oauth = getZoomOAuthConfig();
  const env = getServerEnv();
  const sdkId = env.ZOOM_CLIENT_ID?.trim() || "";
  const instructorId = oauth.clientId;
  const credentialsMixed = Boolean(instructorId && sdkId && instructorId === sdkId);
  return {
    oauthConfigured: isZoomOAuthConfigured(),
    redirectUri: oauth.redirectUri,
    clientIdSuffix: suffix(instructorId),
    clientIdLength: instructorId ? instructorId.length : 0,
    scopes: oauth.scopes,
    includeScopesInAuthorizeUrl: oauth.includeScopesInAuthorizeUrl,
    authorizeHost: "zoom.us",
    meetingSdkClientIdSuffix: suffix(sdkId),
    credentialsMixed,
  };
}

/**
 * Instructor OAuth General App credentials (Connect Zoom).
 * Uses ZOOM_INSTRUCTOR_CLIENT_ID / ZOOM_INSTRUCTOR_CLIENT_SECRET only —
 * never Meeting SDK ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET.
 */
export function getZoomOAuthConfig() {
  const env = getServerEnv();
  const redirectUri = resolveZoomOAuthRedirectUri(env.ZOOM_REDIRECT_URI);
  const scopes = env.ZOOM_OAUTH_SCOPES?.trim() || DEFAULT_ZOOM_OAUTH_SCOPES;
  // Opt-in only. Zoom Marketplace Local Test / docs authorize URLs omit `scope`;
  // including it has caused authorize failures ("Something went wrong", 4,700).
  const includeScopesInAuthorizeUrl =
    String(env.ZOOM_OAUTH_INCLUDE_AUTHORIZE_SCOPES || "")
      .trim()
      .toLowerCase() === "true";
  return {
    clientId: env.ZOOM_INSTRUCTOR_CLIENT_ID?.trim() || "",
    clientSecret: env.ZOOM_INSTRUCTOR_CLIENT_SECRET?.trim() || "",
    redirectUri,
    baseUrl: (env.ZOOM_BASE_URL?.trim() || "https://api.zoom.us/v2").replace(/\/$/, ""),
    scopes,
    includeScopesInAuthorizeUrl,
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
