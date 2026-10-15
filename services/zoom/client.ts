/**
 * Zoom REST client — user OAuth bearer tokens, retries, never logs secrets.
 */

import { getZoomOAuthConfig } from "@/services/zoom/config";
import { logZoomEvent } from "@/services/zoom/logging";
import type { ZoomApiMeeting, ZoomProfile } from "@/types/zoom-oauth";

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ZoomApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, message: string, code = "zoom_api_error") {
    super(message);
    this.name = "ZoomApiError";
    this.status = status;
    this.code = code;
    this.retryable = TRANSIENT.has(status) || status === 0;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function zoomRequest<T>(input: {
  accessToken: string;
  method: string;
  path: string;
  body?: unknown;
  userId?: string | null;
  retries?: number;
}): Promise<T> {
  const { baseUrl } = getZoomOAuthConfig();
  const url = `${baseUrl}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  const attempts = (input.retries ?? 3) + 1;
  let lastError: ZoomApiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });

      if (res.status === 204 || res.status === 202) return {} as T;

      if (TRANSIENT.has(res.status) && attempt < attempts - 1) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 200 * 2 ** attempt);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let parsed: { message?: string; code?: number | string } = {};
        try {
          parsed = JSON.parse(text) as { message?: string; code?: number | string };
        } catch {
          parsed = {};
        }
        const message = parsed.message || text.slice(0, 300) || `Zoom API ${res.status}`;
        logZoomEvent({
          event: "zoom.api.error",
          level: res.status === 401 ? "warn" : "error",
          userId: input.userId,
          message: `Zoom API ${input.method} ${input.path} failed`,
          details: { status: res.status, code: parsed.code ?? null },
        });
        throw new ZoomApiError(res.status, message, String(parsed.code ?? "zoom_api_error"));
      }

      if (res.headers.get("content-type")?.includes("application/json")) {
        return (await res.json()) as T;
      }
      return {} as T;
    } catch (error) {
      if (error instanceof ZoomApiError) throw error;
      lastError = new ZoomApiError(
        0,
        error instanceof Error ? error.message : "Network error",
        "network",
      );
      if (attempt < attempts - 1) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
    }
  }

  throw lastError ?? new ZoomApiError(0, "Zoom request failed", "network");
}

export function instructorMeetingPayload(input: {
  topic: string;
  agenda: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
}) {
  return {
    topic: input.topic,
    agenda: input.agenda,
    type: 2,
    start_time: input.startTime,
    duration: input.durationMinutes,
    timezone: input.timezone,
    settings: {
      host_video: true,
      participant_video: true,
      mute_upon_entry: true,
      waiting_room: false,
      approval_type: 2,
      join_before_host: true,
      meeting_authentication: false,
      who_can_share_screen: "all",
      who_can_share_screen_when_someone_is_sharing: "all",
      request_permission_to_unmute_participants: false,
    },
  };
}

/**
 * Best-effort identity from a Zoom OAuth access token JWT.
 * Used when GET /users/me fails because the Marketplace app is missing
 * `user:read:user` (Zoom error 4711). Never logs the token.
 */
export function profileFromZoomAccessTokenJwt(accessToken: string): ZoomProfile | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      uid?: string;
      userId?: string;
      user_id?: string;
      email?: string;
      aid?: string;
      account_id?: string;
    };
    const zoomUserId = String(json.uid || json.userId || json.user_id || "").trim();
    if (!zoomUserId) return null;
    return {
      zoomUserId,
      email: typeof json.email === "string" ? json.email : "",
      firstName: null,
      lastName: null,
      timezone: null,
      accountId: typeof json.aid === "string" ? json.aid : (json.account_id ?? null),
      type: null,
    };
  } catch {
    return null;
  }
}

export async function fetchZoomProfile(
  accessToken: string,
  userId?: string | null,
): Promise<ZoomProfile> {
  try {
    const json = await zoomRequest<{
      id: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      timezone?: string;
      account_id?: string;
      type?: number;
    }>({
      accessToken,
      method: "GET",
      path: "/users/me",
      userId,
    });

    return {
      zoomUserId: String(json.id),
      email: json.email ?? "",
      firstName: json.first_name ?? null,
      lastName: json.last_name ?? null,
      timezone: json.timezone ?? null,
      accountId: json.account_id ?? null,
      type: json.type ?? null,
    };
  } catch (error) {
    const missingUserScope =
      error instanceof ZoomApiError &&
      (error.code === "4711" ||
        /does not contain scopes/i.test(error.message) ||
        /user:read:user/i.test(error.message));
    if (missingUserScope) {
      const fromJwt = profileFromZoomAccessTokenJwt(accessToken);
      if (fromJwt) {
        logZoomEvent({
          event: "zoom.api.error",
          level: "warn",
          userId,
          message: "GET /users/me missing user:read:user — using access-token identity",
          details: { code: error instanceof ZoomApiError ? error.code : null, via: "jwt_uid" },
        });
        return fromJwt;
      }
      // Last resort: token exchange succeeded and meeting scopes may still work via /users/me/*.
      // Persist a stable instructor-scoped placeholder until Marketplace enables user:read:user.
      if (userId) {
        logZoomEvent({
          event: "zoom.api.error",
          level: "warn",
          userId,
          message: "GET /users/me missing user:read:user — using instructor placeholder identity",
          details: { code: error instanceof ZoomApiError ? error.code : null, via: "placeholder" },
        });
        return {
          zoomUserId: `oauth:${userId}`,
          email: "",
          firstName: null,
          lastName: null,
          timezone: null,
          accountId: null,
          type: null,
        };
      }
    }
    throw error;
  }
}

async function instructorOwnedRequest<T>(input: {
  accessToken: string;
  method: string;
  path: string;
  body?: unknown;
  userId?: string | null;
  retries?: number;
}): Promise<T> {
  if (!input.userId) {
    return zoomRequest<T>(input);
  }
  const { instructorZoomApiRequest } = await import("@/services/zoom/oauth-service");
  return instructorZoomApiRequest<T>({
    userId: input.userId,
    method: input.method,
    path: input.path,
    body: input.body,
    retries: input.retries,
  });
}

export async function createZoomUserMeeting(
  accessToken: string,
  payload: ReturnType<typeof instructorMeetingPayload>,
  userId?: string | null,
): Promise<ZoomApiMeeting> {
  let path = "/users/me/meetings";
  if (userId) {
    const { getIntegrationByUserId } = await import("@/services/zoom/store");
    const { isS2SDelegateIntegration } = await import("@/services/zoom/oauth-service");
    const row = getIntegrationByUserId(userId);
    if (isS2SDelegateIntegration(row) && row?.zoomUserId) {
      path = `/users/${encodeURIComponent(row.zoomUserId)}/meetings`;
    }
  }
  return instructorOwnedRequest<ZoomApiMeeting>({
    accessToken,
    method: "POST",
    path,
    body: payload,
    userId,
  });
}

export async function updateZoomUserMeeting(
  accessToken: string,
  meetingId: string,
  payload: Partial<ReturnType<typeof instructorMeetingPayload>>,
  userId?: string | null,
): Promise<void> {
  await instructorOwnedRequest({
    accessToken,
    method: "PATCH",
    path: `/meetings/${encodeURIComponent(meetingId)}`,
    body: payload,
    userId,
  });
}

export async function deleteZoomUserMeeting(
  accessToken: string,
  meetingId: string,
  userId?: string | null,
): Promise<void> {
  await instructorOwnedRequest({
    accessToken,
    method: "DELETE",
    path: `/meetings/${encodeURIComponent(meetingId)}`,
    userId,
  });
}

export async function getZoomUserMeeting(
  accessToken: string,
  meetingId: string,
  userId?: string | null,
): Promise<ZoomApiMeeting> {
  return instructorOwnedRequest<ZoomApiMeeting>({
    accessToken,
    method: "GET",
    path: `/meetings/${encodeURIComponent(meetingId)}`,
    userId,
  });
}

export async function getZoomMeetingParticipantCount(
  accessToken: string,
  meetingId: string,
  userId?: string | null,
): Promise<number | null> {
  try {
    const json = await instructorOwnedRequest<{
      participants?: unknown[];
      total_records?: number;
    }>({
      accessToken,
      method: "GET",
      path: `/metrics/meetings/${encodeURIComponent(meetingId)}/participants?type=live&page_size=1`,
      userId,
      retries: 0,
    });
    if (typeof json.total_records === "number") return json.total_records;
    if (Array.isArray(json.participants)) return json.participants.length;
    return null;
  } catch {
    return null;
  }
}
