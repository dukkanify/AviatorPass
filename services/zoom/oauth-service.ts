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
  consumePendingOAuthState,
  deleteIntegrationForUser,
  getIntegrationByUserId,
  getIntegrationByZoomUserId,
  readZoomDb,
  upsertIntegration,
  writeZoomDb,
} from "@/services/zoom/store";
import type {
  ZoomIntegrationRecord,
  ZoomOAuthTokenResponse,
  ZoomProfile,
} from "@/types/zoom-oauth";

const STATE_TTL_MS = 15 * 60 * 1000;
/** Refresh-token ciphertext plaintext for Super Admin S2S user delegation. */
export const S2S_DELEGATE_REFRESH_MARKER = "aviatorpass:s2s_delegate";

function authSecret() {
  return getServerEnv().AUTH_SECRET;
}

export function isS2SDelegateIntegration(row: ZoomIntegrationRecord | null | undefined): boolean {
  if (!row?.refreshToken) return false;
  try {
    return decryptSecret(row.refreshToken) === S2S_DELEGATE_REFRESH_MARKER;
  } catch {
    return false;
  }
}

export { getIntegrationByUserId };

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
  const returnTo = input.returnTo || "/instructor/profile";
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
  const payload = Buffer.from(
    JSON.stringify({ userId: input.userId, nonce, exp: expiresAt }),
  ).toString("base64url");
  const state = `${payload}.${signPayload(payload, authSecret())}`;

  // Zoom General App authorize URL must match Marketplace Local Test format:
  //   response_type + client_id + redirect_uri (+ state)
  // Do NOT append `scope` by default — Zoom grants scopes configured on the app.
  // Passing scopes in the query string is a known cause of Marketplace
  // "Something went wrong" / invalid authorize (Zoom DevForum / OAuth 4,700).
  const url = new URL(ZOOM_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  if (cfg.includeScopesInAuthorizeUrl && cfg.scopes) {
    url.searchParams.set("scope", cfg.scopes);
  }
  return url.toString();
}

function parseState(state: string): { userId: string; nonce: string; expiresAt: string } {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) throw new PermissionError("Invalid OAuth state", 400);
  const payload = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!verifySignature(payload, signature, authSecret())) {
    throw new PermissionError("Invalid OAuth state signature", 400);
  }
  let parsed: { userId?: string; nonce?: string; exp?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      nonce?: string;
      exp?: string;
    };
  } catch {
    throw new PermissionError("Invalid OAuth state", 400);
  }
  if (!parsed.userId || !parsed.nonce || !parsed.exp) {
    throw new PermissionError("Invalid OAuth state", 400);
  }
  if (Date.parse(parsed.exp) < Date.now()) {
    throw new PermissionError("OAuth state expired — try Connect again", 400);
  }
  return { userId: parsed.userId, nonce: parsed.nonce, expiresAt: parsed.exp };
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

/** Safe public reason codes for instructor UI (never include tokens/secrets). */
export type ZoomOAuthFailureReason =
  | "denied"
  | "missing_code"
  | "missing_state"
  | "invalid_state"
  | "state_expired"
  | "token_exchange"
  | "missing_user_scope"
  | "profile"
  | "already_linked"
  | "unknown";

function newOAuthCorrelationId() {
  return `zoa_${generateToken(10)}`;
}

function zoomErrorRedirect(input: {
  returnTo?: string;
  reason: ZoomOAuthFailureReason;
  correlationId: string;
}) {
  const dest = (input.returnTo || "/instructor/profile").startsWith("/")
    ? input.returnTo || "/instructor/profile"
    : "/instructor/profile";
  const url = new URL(dest, "https://www.aviatorpass.com");
  url.searchParams.set("zoom", "error");
  url.searchParams.set("reason", input.reason);
  url.searchParams.set("cid", input.correlationId);
  return `${url.pathname}${url.search}`;
}

function classifyOAuthFailure(error: unknown): ZoomOAuthFailureReason {
  if (error instanceof PermissionError && /already connected/i.test(error.message)) {
    return "already_linked";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/token exchange|invalid_grant|invalid_client|redirect_uri/i.test(message)) {
    return "token_exchange";
  }
  if (
    error instanceof ZoomApiError &&
    (error.code === "4711" || /does not contain scopes|user:read:user/i.test(message))
  ) {
    return "missing_user_scope";
  }
  if (/does not contain scopes|user:read:user/i.test(message)) {
    return "missing_user_scope";
  }
  if (/profile|users\/me/i.test(message)) return "profile";
  return "unknown";
}

export { zoomOAuthFailureUserMessage } from "@/features/zoom/oauth-error-messages";

export async function completeZoomOAuthCallback(input: {
  code: string | null;
  state: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): Promise<{ redirectTo: string; userId: string }> {
  const correlationId = newOAuthCorrelationId();

  if (input.error || !input.code || !input.state) {
    const reason: ZoomOAuthFailureReason = input.error
      ? input.error === "access_denied"
        ? "denied"
        : "unknown"
      : !input.code && !input.state
        ? "missing_code"
        : !input.code
          ? "missing_code"
          : "missing_state";
    emitZoomEvent({
      event: "zoom.oauth.failure",
      message: "OAuth callback rejected",
      level: "error",
      details: {
        error: reason,
        correlationId,
        zoomError: input.error ?? null,
        zoomErrorDescription: input.errorDescription
          ? String(input.errorDescription).slice(0, 200)
          : null,
        hasCode: Boolean(input.code),
        hasState: Boolean(input.state),
      },
    });
    await logZoomActivity({
      action: ZOOM_ACTIVITY.OAUTH_FAILED,
      metadata: {
        error: reason,
        correlationId,
        zoomError: input.error ?? null,
      },
    });
    return {
      redirectTo: zoomErrorRedirect({ reason, correlationId }),
      userId: "",
    };
  }

  let parsed: { userId: string; nonce: string };
  try {
    parsed = parseState(input.state);
  } catch (error) {
    const reason: ZoomOAuthFailureReason = /expired/i.test(
      error instanceof Error ? error.message : "",
    )
      ? "state_expired"
      : "invalid_state";
    emitZoomEvent({
      event: "zoom.oauth.failure",
      message: "OAuth state validation failed",
      level: "error",
      details: {
        error: reason,
        correlationId,
        detail: error instanceof Error ? error.message : "invalid_state",
      },
    });
    return {
      redirectTo: zoomErrorRedirect({ reason, correlationId }),
      userId: "",
    };
  }

  const pending = consumePendingOAuthState(parsed.userId, parsed.nonce);

  if (!pending) {
    emitZoomEvent({
      event: "zoom.oauth.failure",
      userId: parsed.userId,
      message: "OAuth state not found or already used",
      level: "error",
      details: { error: "state_expired", correlationId },
    });
    return {
      redirectTo: zoomErrorRedirect({
        returnTo: "/instructor/profile",
        reason: "state_expired",
        correlationId,
      }),
      userId: parsed.userId,
    };
  }

  try {
    const cfg = getZoomOAuthConfig();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: cfg.redirectUri,
    });
    let tokens: ZoomOAuthTokenResponse;
    try {
      tokens = await exchangeToken(body);
    } catch (error) {
      const err = new Error(
        `token exchange: ${error instanceof Error ? error.message.slice(0, 180) : "failed"}`,
      );
      throw err;
    }

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
      details: {
        zoomUserId: profile.zoomUserId,
        zoomEmail: profile.email || null,
        grantedScopes: tokens.scope ?? null,
        correlationId,
      },
      dispatchOutbound: true,
    });
    await logZoomActivity({
      actorId: parsed.userId,
      action: ZOOM_ACTIVITY.OAUTH_CONNECTED,
      entityId: profile.zoomUserId,
      metadata: { zoomEmail: profile.email || null, correlationId },
    });

    const dest = pending.returnTo.startsWith("/") ? pending.returnTo : "/instructor/profile";
    const sep = dest.includes("?") ? "&" : "?";
    return { redirectTo: `${dest}${sep}zoom=connected`, userId: parsed.userId };
  } catch (error) {
    const reason = classifyOAuthFailure(error);
    emitZoomEvent({
      event: "zoom.oauth.failure",
      userId: parsed.userId,
      message:
        reason === "token_exchange"
          ? "OAuth token exchange failed"
          : reason === "missing_user_scope"
            ? "OAuth profile failed — missing user:read:user scope"
            : "OAuth callback processing failed",
      level: "error",
      details: {
        error: reason,
        correlationId,
        detail: error instanceof Error ? error.message.slice(0, 240) : "failed",
        zoomCode: error instanceof ZoomApiError ? error.code : null,
      },
    });
    await logZoomActivity({
      actorId: parsed.userId,
      action: ZOOM_ACTIVITY.OAUTH_FAILED,
      metadata: { error: reason, correlationId },
    });
    return {
      redirectTo: zoomErrorRedirect({
        returnTo: pending.returnTo,
        reason,
        correlationId,
      }),
      userId: parsed.userId,
    };
  }
}

/** Access token for Zoom REST — refresh first, then retry once on 401. */
export async function instructorZoomApiRequest<T>(input: {
  userId: string;
  method: string;
  path: string;
  body?: unknown;
  retries?: number;
}): Promise<T> {
  const { zoomRequest, ZoomApiError } = await import("@/services/zoom/client");
  let accessToken = await refreshInstructorAccessToken(input.userId);
  try {
    return await zoomRequest<T>({
      accessToken,
      method: input.method,
      path: input.path,
      body: input.body,
      userId: input.userId,
      retries: input.retries,
    });
  } catch (error) {
    if (!(error instanceof ZoomApiError) || error.status !== 401) throw error;
    const row = getIntegrationByUserId(input.userId);
    if (row) {
      upsertIntegration({
        ...row,
        expiresAt: new Date(0).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    accessToken = await refreshInstructorAccessToken(input.userId);
    return zoomRequest<T>({
      accessToken,
      method: input.method,
      path: input.path,
      body: input.body,
      userId: input.userId,
      retries: input.retries,
    });
  }
}

export function assertInstructorZoomConnected(instructorId: string): void {
  const row = getIntegrationByUserId(instructorId);
  if (!row || row.status !== "connected") {
    throw new PermissionError(
      "Please connect your Zoom account before creating a live class.",
      409,
    );
  }
  if (row.zoomUserId?.startsWith("oauth:")) {
    throw new PermissionError(
      "Zoom connected without a real Zoom user profile. Enable user:read:user on the Instructor OAuth app, then disconnect and Connect Zoom again before hosting live classes.",
      409,
    );
  }
}

export function listInstructorZoomConnectionSummaries(): Array<{
  userId: string;
  connected: boolean;
  status: "connected" | "reconnect_required" | "disconnected";
  zoomEmail: string | null;
  lastSyncAt: string | null;
}> {
  return readZoomDb().integrations.map((row) => ({
    userId: row.userId,
    connected: row.status === "connected",
    status: row.status,
    zoomEmail: row.zoomEmail,
    lastSyncAt: row.lastSyncAt,
  }));
}

export async function refreshInstructorAccessToken(userId: string): Promise<string> {
  const row = getIntegrationByUserId(userId);
  if (!row) throw new PermissionError("Zoom is not connected", 409);

  if (Date.parse(row.expiresAt) > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return decryptSecret(row.accessToken);
  }

  if (isS2SDelegateIntegration(row)) {
    const { getZoomS2SAccessToken } = await import("@/services/classes/zoom-service");
    const accessToken = await getZoomS2SAccessToken();
    if (!accessToken) {
      throw new PermissionError("Zoom Server-to-Server credentials are not configured.", 503);
    }
    const now = new Date().toISOString();
    upsertIntegration({
      ...row,
      accessToken: encryptSecret(accessToken),
      refreshToken: encryptSecret(S2S_DELEGATE_REFRESH_MARKER),
      expiresAt: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
      lastSyncAt: now,
      status: "connected",
      updatedAt: now,
    });
    return accessToken;
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

async function fetchZoomUserByEmailOrId(input: { token: string; emailOrId: string }): Promise<{
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  type: number | null;
  status: string | null;
} | null> {
  const { zoomRequest, ZoomApiError } = await import("@/services/zoom/client");
  try {
    const user = await zoomRequest<{
      id: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      type?: number;
      status?: string;
    }>({
      accessToken: input.token,
      method: "GET",
      path: `/users/${encodeURIComponent(input.emailOrId)}`,
    });
    return {
      id: String(user.id),
      email: user.email ?? input.emailOrId,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      type: user.type ?? null,
      status: user.status ?? null,
    };
  } catch (error) {
    if (error instanceof ZoomApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}

/**
 * Lists Zoom users the S2S app can resolve without user:read:list_users:admin.
 * Uses /users/{email|id} lookups for platform host + optional emails query.
 */
export async function listZoomAccountUsers(emails?: string[]): Promise<
  Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    type: number | null;
    status: string | null;
  }>
> {
  const { getZoomS2SAccessToken } = await import("@/services/classes/zoom-service");
  const { getPlatformSettings } = await import("@/services/settings/settings-service");
  const token = await getZoomS2SAccessToken();
  if (!token) {
    throw new PermissionError("Zoom Server-to-Server credentials are not configured.", 503);
  }

  const settings = getPlatformSettings();
  const candidates = new Set<string>();
  candidates.add("me");
  if (settings.zoom.accountEmail?.trim()) candidates.add(settings.zoom.accountEmail.trim());
  for (const email of emails ?? []) {
    if (email.trim()) candidates.add(email.trim());
  }

  const users: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    type: number | null;
    status: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const user = await fetchZoomUserByEmailOrId({ token, emailOrId: candidate });
    if (user) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      users.push(user);
      continue;
    }
    if (!candidate.includes("@") || seen.has(candidate.toLowerCase())) continue;
    // Without user:read, verify membership via meetings list (404 => not a Zoom user).
    try {
      const { zoomRequest } = await import("@/services/zoom/client");
      await zoomRequest({
        accessToken: token,
        method: "GET",
        path: `/users/${encodeURIComponent(candidate)}/meetings?type=scheduled&page_size=1`,
      });
      seen.add(candidate.toLowerCase());
      users.push({
        id: candidate,
        email: candidate,
        firstName: null,
        lastName: null,
        type: null,
        status: "active",
      });
    } catch {
      // Skip emails that are not Zoom account users.
    }
  }
  return users;
}

/**
 * Super Admin only: bind an instructor to a Zoom account user via S2S so
 * classrooms host on that user (not the shared platform host) when interactive
 * General App OAuth cannot be completed in the delivery environment.
 */
export async function delegateConnectInstructorZoom(input: {
  instructorId: string;
  zoomUserEmail: string;
  actorId?: string | null;
}): Promise<{
  userId: string;
  zoomUserId: string;
  zoomEmail: string;
  connected: true;
}> {
  const instructor = findUserById(input.instructorId);
  if (!instructor) throw new PermissionError("Instructor not found", 404);
  const email = input.zoomUserEmail.trim().toLowerCase();
  if (!email) throw new PermissionError("zoomUserEmail is required", 400);

  const { getZoomS2SAccessToken } = await import("@/services/classes/zoom-service");
  const { zoomRequest, ZoomApiError } = await import("@/services/zoom/client");
  const accessToken = await getZoomS2SAccessToken();
  if (!accessToken) {
    throw new PermissionError("Zoom Server-to-Server credentials are not configured.", 503);
  }

  // Prefer profile lookup. If S2S lacks user:read, probe meeting list for that
  // email — Zoom returns 404/1001 when the user is not on the account.
  let match = await fetchZoomUserByEmailOrId({ token: accessToken, emailOrId: email });
  if (!match) {
    try {
      await zoomRequest({
        accessToken,
        method: "GET",
        path: `/users/${encodeURIComponent(email)}/meetings?type=scheduled&page_size=1`,
      });
      match = {
        id: email,
        email,
        firstName: null,
        lastName: null,
        type: null,
        status: "active",
      };
    } catch (error) {
      if (
        error instanceof ZoomApiError &&
        (error.status === 404 || /does not exist/i.test(error.message))
      ) {
        throw new PermissionError(
          `No active Zoom user found for ${email}. Invite them on the Zoom account first.`,
          404,
        );
      }
      if (error instanceof ZoomApiError && error.status === 400) {
        throw new PermissionError(
          `Unable to verify Zoom user ${email}. Check S2S scopes / account membership.`,
          400,
        );
      }
      throw error;
    }
  }

  const existingOwner = getIntegrationByZoomUserId(match.id);
  if (existingOwner && existingOwner.userId !== input.instructorId) {
    throw new PermissionError(
      "That Zoom user is already linked to another instructor. Disconnect them first.",
      409,
    );
  }

  const now = new Date().toISOString();
  const existing = getIntegrationByUserId(input.instructorId);
  const profile: ZoomProfile = {
    zoomUserId: match.id,
    email: match.email,
    firstName: match.firstName,
    lastName: match.lastName,
    timezone: null,
    accountId: null,
    type: match.type,
  };
  upsertIntegration({
    id: existing?.id ?? generateId(),
    userId: input.instructorId,
    zoomUserId: match.id,
    zoomEmail: match.email,
    accessToken: encryptSecret(accessToken),
    refreshToken: encryptSecret(S2S_DELEGATE_REFRESH_MARKER),
    expiresAt: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
    connectedAt: existing?.connectedAt ?? now,
    lastSyncAt: now,
    status: "connected",
    scopes: "s2s_delegate",
    cachedProfile: profile,
    profileCachedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  emitZoomEvent({
    event: "zoom.oauth.success",
    userId: input.instructorId,
    message: "Instructor Zoom linked via platform S2S delegate",
    details: { zoomEmail: match.email, via: "s2s_delegate" },
    dispatchOutbound: true,
  });
  await logZoomActivity({
    actorId: input.actorId ?? input.instructorId,
    action: ZOOM_ACTIVITY.OAUTH_CONNECTED,
    entityId: input.instructorId,
    metadata: { zoomEmail: match.email, via: "s2s_delegate" },
  });

  return {
    userId: input.instructorId,
    zoomUserId: match.id,
    zoomEmail: match.email,
    connected: true,
  };
}

export async function disconnectZoomIntegration(userId: string): Promise<void> {
  const row = getIntegrationByUserId(userId);
  if (!row) return;
  if (!isS2SDelegateIntegration(row)) {
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
