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

      if (res.status === 204) return {} as T;

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
      participant_video: false,
      mute_upon_entry: true,
      waiting_room: true,
      approval_type: 0,
      join_before_host: false,
      meeting_authentication: false,
    },
  };
}

export async function fetchZoomProfile(
  accessToken: string,
  userId?: string | null,
): Promise<ZoomProfile> {
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
}

export async function createZoomUserMeeting(
  accessToken: string,
  payload: ReturnType<typeof instructorMeetingPayload>,
  userId?: string | null,
): Promise<ZoomApiMeeting> {
  return zoomRequest<ZoomApiMeeting>({
    accessToken,
    method: "POST",
    path: "/users/me/meetings",
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
  await zoomRequest({
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
  await zoomRequest({
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
  return zoomRequest<ZoomApiMeeting>({
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
    const json = await zoomRequest<{
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
