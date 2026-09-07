/**
 * Instructor Zoom General OAuth — connect, callback, refresh, disconnect.
 */

import { generateId, generateToken, signPayload, verifySignature } from "@/lib/security/crypto";
import { getServerEnv } from "@/config/env";
import { PermissionError } from "@/services/auth/permissions";
import { findUserById } from "@/services/auth/store";
import { decryptSecret, encryptSecret } from "@/services/zoom/crypto";
import {
  getZoomOAuthConfig,
  isZoomOAuthConfigured,
  TOKEN_REFRESH_SKEW_MS,
  ZOOM_OAUTH_AUTHORIZE_URL,
  ZOOM_OAUTH_REVOKE_URL,
  ZOOM_OAUTH_TOKEN_URL,
  ZOOM_PROFILE_CACHE_MS,
  zoomBasicAuthHeader,
} from "@/services/zoom/config";
import { emitZoomEvent } from "@/services/zoom/events";
import { fetchZoomProfile, ZoomApiError } from "@/services/zoom/client";
import { logZoomActivity, ZOOM_ACTIVITY } from "@/services/zoom/logging";
import { publicIntegrationView } from "@/services/zoom/policy";
import {
  deleteIntegrationForUser,
  getIntegrationByUserId,
  getIntegrationByZoomUserId,
  upsertIntegration,
  writeZoomDb,
} from "@/services/zoom/store";
import type {
  ZoomIntegrationRecord,
  ZoomOAuthTokenResponse,
  ZoomProfile,
} from "@/types/zoom-oauth";

const STATE_TTL_MS = 15 * 60 * 1000;

function authSecret() {
  return getServerEnv().AUTH_SECRET;
}

export function getInstructorZoomStatus(userId: string) {
  return publicIntegrationView(userId, isZoomOAuthConfigured());
}

export function buildZoomAuthorizeUrl(input: { userId: string; returnTo?: string }): string {
  if (!isZoomOAuthConfigured()) {
    throw new PermissionError("Zoom OAuth is not configured", 503);
  }
  const cfg = getZoomOAuthConfig();
  const nonce = generateToken(16);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  const returnTo = input.returnTo || "/instructor/dashboard";
  writeZoomDb((db) => {
    db.pendingStates = db.pendingStates.filter((s) => Date.parse(s.expiresAt) > Date.now());
    db.pendingStates.push({
      nonce,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      expiresAt,
      returnTo,
    });
  });
  const payload = `${input.userId}.${nonce}.${expiresAt}`;
  const state = `${payload}.${signPayload(payload, authSecret())}`;

  const url = new URL(ZOOM_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", cfg.scopes);
  return url.toString();
}

function parseState(state: string): { userId: string; nonce: string; expiresAt: string } {
  const parts = state.split(".");
  if (parts.length < 4) throw new PermissionError("Invalid OAuth state", 400);
  const signature = parts.pop()!;
  const expiresAt = parts.pop()!;
  const nonce = parts.pop()!;
  const userId = parts.join(".");
  const payload = `${userId}.${nonce}.${expiresAt}`;
  if (!verifySignature(payload, signature, authSecret())) {
    throw new PermissionError("Invalid OAuth state signature", 400);
  }
  if (Date.parse(expiresAt) < Date.now()) {
    throw new PermissionError("OAuth state expired — try Connect again", 400);
  }
  return { userId, nonce, expiresAt };
}

async function exchangeToken(body: URLSearchParams): Promise<ZoomOAuthTokenResponse> {
  const res = await fetch(ZOOM_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: zoomBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ZoomApiError(
      res.status,
      text.slice(0, 400) || "Zoom token exchange failed",
      "token_exchange",
    );
  }
  return (await res.json()) as ZoomOAuthTokenResponse;
}

function persistTokens(
  existing: ZoomIntegrationRecord | null,
  input: {
    userId: string;
    tokens: ZoomOAuthTokenResponse;
    profile: ZoomProfile;
  },
): ZoomIntegrationRecord {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + input.tokens.expires_in * 1000).toISOString();
  return upsertIntegration({
    id: existing?.id ?? generateId(),
    userId: input.userId,
    zoomUserId: input.profile.zoomUserId,
    zoomEmail: input.profile.email,
    accessToken: encryptSecret(input.tokens.access_token),
    refreshToken: encryptSecret(input.tokens.refresh_token),
    expiresAt,
    connectedAt: existing?.connectedAt ?? now,
    lastSyncAt: now,
    status: "connected",
    scopes: input.tokens.scope ?? getZoomOAuthConfig().scopes,
    cachedProfile: input.profile,
    profileCachedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function completeZoomOAuthCallback(input: {
  code: string | null;
  state: string | null;
  error?: string | null;
}): Promise<{ redirectTo: string; userId: string }> {
  if (input.error || !input.code || !input.state) {
    emitZoomEvent({
      event: "zoom.oauth.failure",
      message: "OAuth callback rejected",
      level: "error",
      details: { error: input.error ?? "missing_code_or_state" },
    });
    await logZoomActivity({
      action: ZOOM_ACTIVITY.OAUTH_FAILED,
      metadata: { error: input.error ?? "missing_code_or_state" },
    });
    return { redirectTo: "/instructor/dashboard?zoom=error", userId: "" };
  }

  let parsed: { userId: string; nonce: string };
  try {
    parsed = parseState(input.state);
  } catch (error) {
    emitZoomEvent({
      event: "zoom.oauth.failure",
      message: "OAuth state validation failed",
      level: "error",
      details: { error: error instanceof Error ? error.message : "invalid_state" },
    });
    return { redirectTo: "/instructor/dashboard?zoom=error", userId: "" };
  }

  let pending: { nonce: string; userId: string; returnTo: string } | null = null;
  writeZoomDb((db) => {
    const idx = db.pendingStates.findIndex(
      (s) => s.nonce === parsed.nonce && s.userId === parsed.userId,
    );
    if (idx < 0) return;
    pending = db.pendingStates[idx]!;
    db.pendingStates.splice(idx, 1);
  });

  if (!pending) {
    emitZoomEvent({
      event: "zoom.oauth.failure",
      userId: parsed.userId,
      message: "OAuth state not found or already used",
      level: "error",
    });
    return { redirectTo: "/instructor/dashboard?zoom=error", userId: parsed.userId };
  }

  try {
    const cfg = getZoomOAuthConfig();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: cfg.redirectUri,
    });
    const tokens = await exchangeToken(body);
    const profile = await fetchZoomProfile(tokens.access_token, parsed.userId);

    const taken = getIntegrationByZoomUserId(profile.zoomUserId);
    if (taken && taken.userId !== parsed.userId) {
      throw new PermissionError(
        "This Zoom account is already connected to another instructor",
        409,
      );
    }

    persistTokens(getIntegrationByUserId(parsed.userId), {
      userId: parsed.userId,
      tokens,
      profile,
    });

    emitZoomEvent({
      event: "zoom.oauth.success",
      userId: parsed.userId,
      message: "Instructor Zoom account connected",
      details: { zoomUserId: profile.zoomUserId, zoomEmail: profile.email },
      dispatchOutbound: true,
    });
    await logZoomActivity({
      actorId: parsed.userId,
      action: ZOOM_ACTIVITY.OAUTH_CONNECTED,
      entityId: profile.zoomUserId,
      metadata: { zoomEmail: profile.email },
    });

    const dest = pending.returnTo.startsWith("/") ? pending.returnTo : "/instructor/dashboard";
    const sep = dest.includes("?") ? "&" : "?";
    return { redirectTo: `${dest}${sep}zoom=connected`, userId: parsed.userId };
  } catch (error) {
    emitZoomEvent({
      event: "zoom.oauth.failure",
      userId: parsed.userId,
      message: "OAuth token exchange failed",
      level: "error",
      details: { error: error instanceof Error ? error.message : "exchange_failed" },
    });
    await logZoomActivity({
      actorId: parsed.userId,
      action: ZOOM_ACTIVITY.OAUTH_FAILED,
      metadata: { error: error instanceof Error ? error.message : "exchange_failed" },
    });
    return { redirectTo: "/instructor/dashboard?zoom=error", userId: parsed.userId };
  }
}

export async function refreshInstructorAccessToken(userId: string): Promise<string> {
  const row = getIntegrationByUserId(userId);
  if (!row) throw new PermissionError("Zoom is not connected", 409);

  if (Date.parse(row.expiresAt) > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return decryptSecret(row.accessToken);
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(row.refreshToken),
    });
    const tokens = await exchangeToken(body);
    const profile =
      row.cachedProfile ??
      (await fetchZoomProfile(tokens.access_token, userId).catch(() => ({
        zoomUserId: row.zoomUserId,
        email: row.zoomEmail,
        firstName: null,
        lastName: null,
        timezone: null,
        accountId: null,
        type: null,
      })));
    persistTokens(row, { userId, tokens, profile });
    emitZoomEvent({
      event: "zoom.token.refreshed",
      userId,
      message: "Zoom access token refreshed",
    });
    await logZoomActivity({
      actorId: userId,
      action: ZOOM_ACTIVITY.TOKEN_REFRESHED,
      entityId: row.id,
    });
    return tokens.access_token;
  } catch (error) {
    const now = new Date().toISOString();
    upsertIntegration({
      ...row,
      status: "reconnect_required",
      updatedAt: now,
    });
    emitZoomEvent({
      event: "zoom.api.error",
      userId,
      level: "warn",
      message: "Zoom refresh token rejected — reconnect required",
      details: { error: error instanceof Error ? error.message : "refresh_failed" },
    });
    throw new PermissionError("Zoom connection expired. Reconnect your Zoom account.", 409);
  }
}

export async function getValidInstructorAccessToken(userId: string): Promise<string | null> {
  const row = getIntegrationByUserId(userId);
  if (!row || row.status === "reconnect_required") return null;
  try {
    return await refreshInstructorAccessToken(userId);
  } catch {
    return null;
  }
}

export async function getCachedZoomProfile(userId: string): Promise<ZoomProfile | null> {
  const row = getIntegrationByUserId(userId);
  if (!row) return null;
  if (
    row.cachedProfile &&
    row.profileCachedAt &&
    Date.now() - Date.parse(row.profileCachedAt) < ZOOM_PROFILE_CACHE_MS
  ) {
    return row.cachedProfile;
  }
  const token = await getValidInstructorAccessToken(userId);
  if (!token) return row.cachedProfile;
  const profile = await fetchZoomProfile(token, userId);
  const now = new Date().toISOString();
  upsertIntegration({
    ...row,
    zoomUserId: profile.zoomUserId,
    zoomEmail: profile.email,
    cachedProfile: profile,
    profileCachedAt: now,
    lastSyncAt: now,
    updatedAt: now,
  });
  return profile;
}

export async function disconnectZoomIntegration(userId: string): Promise<void> {
  const row = getIntegrationByUserId(userId);
  if (!row) return;
  try {
    const token = decryptSecret(row.accessToken);
    await fetch(ZOOM_OAUTH_REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: zoomBasicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Revoke is best-effort — local disconnect always succeeds.
  }
  deleteIntegrationForUser(userId);
  emitZoomEvent({
    event: "zoom.oauth.disconnected",
    userId,
    message: "Instructor Zoom account disconnected",
    dispatchOutbound: true,
  });
  await logZoomActivity({
    actorId: userId,
    action: ZOOM_ACTIVITY.OAUTH_DISCONNECTED,
    entityId: row.id,
  });
}

export function instructorTimezone(userId: string, fallback: string): string {
  const profile = getIntegrationByUserId(userId)?.cachedProfile;
  const user = findUserById(userId);
  return profile?.timezone?.trim() || user?.timezone?.trim() || fallback || "UTC";
}
