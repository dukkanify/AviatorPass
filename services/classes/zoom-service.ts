/**
 * Zoom API service — Server-to-Server OAuth with secure mock fallback.
 * Secrets never leave the server (env only).
 */

import { generateId, generateToken } from "@/lib/security/crypto";
import { appJoinUrl, rewriteAppAbsoluteUrl } from "@/lib/site-origin";
import {
  PROJECT_CONTACT_EMAIL,
  PROJECT_SUPPORT_EMAIL,
} from "@/lib/branding/legacy-client-identity";
import { zakFromStartUrl } from "@/lib/zoom/meeting-sdk";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import { getZoomS2SCredentials } from "@/lib/zoom/s2s-credentials";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity } from "@/services/auth/activity-log";
import { readClassesDb, writeClassesDb } from "@/services/classes/store";
import { sanitizeJoinInfoForViewer } from "@/services/zoom/policy";
import { getIntegrationByUserId } from "@/services/zoom/store";
import { ClassValidationError } from "@/services/classes/validation";
import type { LiveClass, MeetingType, ZoomMeetingRecord } from "@/types/classes";

export function isZoomConfigured(): boolean {
  return zoomCredsPresent();
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function getZoomCredentialInventory() {
  return {
    accountId: envPresent("ZOOM_ACCOUNT_ID"),
    clientId: envPresent("ZOOM_CLIENT_ID"),
    clientSecret: envPresent("ZOOM_CLIENT_SECRET"),
    s2sClientId: envPresent("ZOOM_S2S_CLIENT_ID"),
    s2sClientSecret: envPresent("ZOOM_S2S_CLIENT_SECRET"),
    webhookSecret: envPresent("ZOOM_WEBHOOK_SECRET"),
    secretToken: envPresent("ZOOM_SECRET_TOKEN"),
    redirectUri: envPresent("ZOOM_REDIRECT_URI"),
    meetingSdk: Boolean(getZoomMeetingSdkCredentials()),
  };
}

export function isMockZoomAllowed(): boolean {
  if (process.env.ALLOW_ZOOM_MOCK === "true") return true;
  if (process.env.FORBID_ZOOM_MOCK === "true") return false;
  return (
    process.env.NEXT_PUBLIC_APP_ENV !== "production" && process.env.VERCEL_ENV !== "production"
  );
}

function zoomCredsPresent(): boolean {
  try {
    return Boolean(getZoomS2SCredentials());
  } catch {
    return false;
  }
}

/** Support/contact mailboxes are not Zoom users on the S2S account. */
export function resolveZoomS2SUser(accountEmail: string | null | undefined): string {
  const value = accountEmail?.trim() ?? "";
  if (!value || !value.includes("@")) return "me";
  const lower = value.toLowerCase();
  if (lower === PROJECT_SUPPORT_EMAIL.toLowerCase()) return "me";
  if (lower === PROJECT_CONTACT_EMAIL.toLowerCase()) return "me";
  return value;
}

export function isZoomMissingUserError(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { code?: number };
    return parsed.code === 1001;
  } catch {
    return /user does not exist/i.test(body);
  }
}

function requireLiveZoom(reason: string): never {
  throw new ClassValidationError(reason, 503);
}

let cachedToken: { accessToken: string; expiresAt: number; scopes: string[] } | null = null;

function parseZoomScopes(scope: string | undefined): string[] {
  return (scope ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Scopes on the last Server-to-Server access token — never the token itself. */
export function getZoomS2STokenScopes(): string[] {
  return cachedToken?.scopes ?? [];
}

export function resetZoomS2STokenCacheForTests(): void {
  cachedToken = null;
}

/** Server-to-Server OAuth only — create / update / delete. Never a Meeting SDK JWT. */
async function getZoomAccessToken(): Promise<string | null> {
  const creds = getZoomS2SCredentials();
  if (!creds) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", creds.accountId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    console.error("Zoom OAuth failed", await res.text());
    return null;
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scopes: parseZoomScopes(json.scope),
  };
  return json.access_token;
}

function mockMeeting(
  liveClass: LiveClass,
  opts: { waitingRoom: boolean; passcode: boolean; meetingType: MeetingType },
): Omit<ZoomMeetingRecord, "id" | "createdAt" | "updatedAt"> {
  const zoomMeetingId = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
  const password = opts.passcode
    ? generateToken(6)
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8) || "AviatorPass1"
    : "";
  return {
    liveClassId: liveClass.id,
    zoomMeetingId,
    zoomUuid: generateId(),
    joinUrl: appJoinUrl(liveClass.id, zoomMeetingId),
    startUrl: appJoinUrl(liveClass.id, zoomMeetingId, true),
    password,
    hostEmail: getPlatformSettings().zoom.accountEmail || null,
    waitingRoom: opts.waitingRoom,
    passcodeEnabled: opts.passcode,
    coHostEmails: [],
    providerMode: "mock",
    hostId: null,
    timezone: liveClass.timezone,
    durationMinutes: liveClass.durationMinutes,
    startTime: liveClass.startsAt,
    status: "scheduled",
    oauthUserId: null,
    participantCount: null,
    raw: {
      mock: true,
      topic: liveClass.title,
      type: opts.meetingType === "webinar" ? 5 : 2,
      start_time: liveClass.startsAt,
      duration: liveClass.durationMinutes,
    },
  };
}

async function createZoomApiMeeting(
  liveClass: LiveClass,
  opts: { waitingRoom: boolean; passcode: boolean; meetingType: MeetingType },
): Promise<Omit<ZoomMeetingRecord, "id" | "createdAt" | "updatedAt"> | null> {
  const token = await getZoomAccessToken();
  if (!token) return null;

  const settings = getPlatformSettings();
  const body = {
    topic: liveClass.title,
    type: 2,
    start_time: liveClass.startsAt,
    duration: liveClass.durationMinutes,
    timezone: liveClass.timezone,
    agenda: liveClass.description,
    password: opts.passcode ? undefined : "",
    settings: {
      waiting_room: opts.waitingRoom,
      // true so Meeting SDK participants can enter before a host ZAK is available (error 3008).
      join_before_host: true,
      mute_upon_entry: true,
      host_video: true,
      participant_video: true,
      // 2 = no registration. 0/1 require registration and Meeting SDK returns 3099.
      approval_type: 2,
      meeting_authentication: false,
      who_can_share_screen: "all",
    },
  };

  const postMeeting = (user: string) => {
    const endpoint =
      opts.meetingType === "webinar"
        ? `https://api.zoom.us/v2/users/${encodeURIComponent(user)}/webinars`
        : `https://api.zoom.us/v2/users/${encodeURIComponent(user)}/meetings`;
    return fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };

  let user = resolveZoomS2SUser(settings.zoom.accountEmail);
  let res = await postMeeting(user);
  if (!res.ok) {
    const errorText = await res.text();
    if (user !== "me" && isZoomMissingUserError(errorText)) {
      user = "me";
      res = await postMeeting(user);
    } else {
      console.error("Zoom create meeting failed", errorText);
      return null;
    }
  }

  if (!res.ok) {
    console.error("Zoom create meeting failed", await res.text());
    return null;
  }

  const json = (await res.json()) as {
    id: number | string;
    uuid?: string;
    join_url: string;
    start_url: string;
    password?: string;
    host_email?: string;
    host_id?: string;
  };

  return {
    liveClassId: liveClass.id,
    zoomMeetingId: String(json.id),
    zoomUuid: json.uuid ?? null,
    joinUrl: json.join_url,
    startUrl: json.start_url,
    password: json.password ?? "",
    hostEmail: json.host_email ?? settings.zoom.accountEmail ?? null,
    waitingRoom: opts.waitingRoom,
    passcodeEnabled: opts.passcode,
    coHostEmails: [],
    providerMode: "zoom",
    hostId: json.host_id ?? null,
    timezone: liveClass.timezone,
    durationMinutes: liveClass.durationMinutes,
    startTime: liveClass.startsAt,
    status: "scheduled",
    oauthUserId: null,
    participantCount: null,
    raw: json as unknown as Record<string, unknown>,
  };
}

export async function createMeetingForClass(input: {
  liveClass: LiveClass;
  waitingRoom?: boolean;
  passcode?: boolean;
  meetingType?: MeetingType;
  actorId?: string | null;
}): Promise<ZoomMeetingRecord> {
  try {
    const { createInstructorZoomMeeting } = await import("@/services/zoom/meeting-service");
    const instructorMeeting = await createInstructorZoomMeeting({
      liveClass: input.liveClass,
      actorId: input.actorId,
    });
    if (instructorMeeting) return instructorMeeting;
  } catch (error) {
    console.error("Instructor Zoom create failed; falling back", error);
  }

  const settings = getPlatformSettings();
  const waitingRoom = input.waitingRoom ?? settings.zoom.defaultWaitingRoom;
  const passcode = input.passcode ?? settings.zoom.defaultPasscode;
  const meetingType =
    input.meetingType ?? settings.zoom.defaultMeetingType ?? input.liveClass.meetingType;

  let payload =
    settings.zoom.enabled && zoomCredsPresent()
      ? await createZoomApiMeeting(input.liveClass, { waitingRoom, passcode, meetingType })
      : null;

  if (!payload) {
    if (!isMockZoomAllowed()) {
      requireLiveZoom(
        zoomCredsPresent()
          ? "Zoom API failed to create a live meeting. Check Server-to-Server OAuth credentials and account scopes."
          : "Zoom is not configured for production. Set ZOOM_ACCOUNT_ID, ZOOM_S2S_CLIENT_ID, and ZOOM_S2S_CLIENT_SECRET, or connect an instructor Zoom account.",
      );
    }
    payload = mockMeeting(input.liveClass, { waitingRoom, passcode, meetingType });
  }

  const now = new Date().toISOString();
  const record: ZoomMeetingRecord = {
    id: generateId(),
    ...payload,
    createdAt: now,
    updatedAt: now,
  };

  writeClassesDb((d) => {
    d.zoomMeetings = d.zoomMeetings.filter((z) => z.liveClassId !== input.liveClass.id);
    d.zoomMeetings.push(record);
    const idx = d.classes.findIndex((c) => c.id === input.liveClass.id);
    if (idx >= 0) {
      const current = d.classes[idx]!;
      d.classes[idx] = {
        ...current,
        zoomMeetingId: record.id,
        updatedAt: now,
      };
    }
  });

  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ZOOM_MEETING_CREATED,
    entityType: "zoom_meeting",
    entityId: record.id,
    metadata: {
      liveClassId: input.liveClass.id,
      zoomMeetingId: record.zoomMeetingId,
      providerMode: record.providerMode,
    },
  });

  return record;
}

export async function updateMeetingForClass(input: {
  liveClass: LiveClass;
  actorId?: string | null;
}): Promise<ZoomMeetingRecord | null> {
  const existing = readClassesDb().zoomMeetings.find((z) => z.liveClassId === input.liveClass.id);
  if (!existing)
    return createMeetingForClass({ liveClass: input.liveClass, actorId: input.actorId });

  try {
    const { updateInstructorZoomMeeting } = await import("@/services/zoom/meeting-service");
    const instructorConnected = Boolean(
      existing.oauthUserId || getIntegrationByUserId(input.liveClass.instructorId),
    );
    if (instructorConnected) {
      const updated = await updateInstructorZoomMeeting({
        liveClass: input.liveClass,
        existing,
        actorId: input.actorId,
      });
      if (updated) {
        return (
          readClassesDb().zoomMeetings.find((z) => z.liveClassId === input.liveClass.id) ?? existing
        );
      }
    }
  } catch (error) {
    console.error("Instructor Zoom update failed; falling back", error);
  }

  let startUrl = existing.startUrl;
  if (existing.providerMode === "zoom" && zoomCredsPresent()) {
    const token = await getZoomAccessToken();
    if (token) {
      await fetch(`https://api.zoom.us/v2/meetings/${existing.zoomMeetingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: input.liveClass.title,
          start_time: input.liveClass.startsAt,
          duration: input.liveClass.durationMinutes,
          timezone: input.liveClass.timezone,
          agenda: input.liveClass.description,
        }),
      }).catch((err) => console.error("Zoom update failed", err));
      const refreshed = await fetchZoomMeetingStartUrl(token, existing.zoomMeetingId);
      if (refreshed) startUrl = refreshed;
    }
  }

  const now = new Date().toISOString();
  const next: ZoomMeetingRecord = {
    ...existing,
    startUrl,
    updatedAt: now,
    raw: {
      ...existing.raw,
      topic: input.liveClass.title,
      start_time: input.liveClass.startsAt,
      duration: input.liveClass.durationMinutes,
    },
  };
  writeClassesDb((d) => {
    const idx = d.zoomMeetings.findIndex((z) => z.id === existing.id);
    if (idx >= 0) d.zoomMeetings[idx] = next;
  });

  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ZOOM_MEETING_UPDATED,
    entityType: "zoom_meeting",
    entityId: next.id,
    metadata: { liveClassId: input.liveClass.id },
  });

  return next;
}

export async function cancelMeetingForClass(input: {
  liveClassId: string;
  actorId?: string | null;
}): Promise<void> {
  const existing = readClassesDb().zoomMeetings.find((z) => z.liveClassId === input.liveClassId);
  if (!existing) return;

  try {
    const { deleteInstructorZoomMeeting } = await import("@/services/zoom/meeting-service");
    const instructorId =
      existing.oauthUserId ||
      readClassesDb().classes.find((c) => c.id === input.liveClassId)?.instructorId ||
      "";
    if (existing.oauthUserId || (instructorId && getIntegrationByUserId(instructorId))) {
      const deleted = await deleteInstructorZoomMeeting({
        liveClassId: input.liveClassId,
        existing,
        actorId: input.actorId,
        notify: false,
      });
      if (deleted) return;
    }
  } catch (error) {
    console.error("Instructor Zoom delete failed; falling back", error);
  }

  if (existing.providerMode === "zoom" && zoomCredsPresent()) {
    const token = await getZoomAccessToken();
    if (token) {
      await fetch(`https://api.zoom.us/v2/meetings/${existing.zoomMeetingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => console.error("Zoom cancel failed", err));
    }
  }

  writeClassesDb((d) => {
    d.zoomMeetings = d.zoomMeetings.filter((z) => z.id !== existing.id);
    const idx = d.classes.findIndex((c) => c.id === input.liveClassId);
    if (idx >= 0) {
      const current = d.classes[idx]!;
      d.classes[idx] = { ...current, zoomMeetingId: null, updatedAt: new Date().toISOString() };
    }
  });

  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ZOOM_MEETING_CANCELLED,
    entityType: "zoom_meeting",
    entityId: existing.id,
    metadata: { liveClassId: input.liveClassId, zoomMeetingId: existing.zoomMeetingId },
  });
}

export function getZoomMeetingByClassId(liveClassId: string): ZoomMeetingRecord | null {
  const meeting = readClassesDb().zoomMeetings.find((z) => z.liveClassId === liveClassId) ?? null;
  if (!meeting) return null;
  return {
    ...meeting,
    joinUrl:
      rewriteAppAbsoluteUrl(meeting.joinUrl) ||
      appJoinUrl(meeting.liveClassId, meeting.zoomMeetingId),
    startUrl:
      rewriteAppAbsoluteUrl(meeting.startUrl) ||
      appJoinUrl(meeting.liveClassId, meeting.zoomMeetingId, true),
  };
}

export function getZoomMeetingByNumber(
  meetingNumber: string | null | undefined,
): ZoomMeetingRecord | null {
  const id = String(meetingNumber ?? "").replace(/\D/g, "");
  if (!id) return null;
  return readClassesDb().zoomMeetings.find((z) => z.zoomMeetingId === id) ?? null;
}

/** Safe public join info — never includes start_url for non-hosts */
export function getPublicJoinInfo(liveClassId: string, isHost: boolean) {
  return sanitizeJoinInfoForViewer(getZoomMeetingByClassId(liveClassId), isHost);
}

export function refreshZoomCredentialsFlag(): boolean {
  return zoomCredsPresent();
}

/**
 * Provision a Zoom (or mock) meeting not tied to a live class —
 * used by 1:1 appointment bookings.
 */
export async function provisionStandaloneZoomMeeting(input: {
  topic: string;
  agenda?: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  mockJoinPath: string;
  waitingRoom?: boolean;
  passcode?: boolean;
  actorId?: string | null;
}): Promise<{
  meetingNumber: string;
  joinUrl: string;
  startUrl: string;
  password: string;
  waitingRoom: boolean;
  providerMode: "mock" | "zoom";
}> {
  const settings = getPlatformSettings();
  const waitingRoom = input.waitingRoom ?? settings.zoom.defaultWaitingRoom;
  const passcode = input.passcode ?? settings.zoom.defaultPasscode;

  const synthetic: LiveClass = {
    id: "standalone",
    title: input.topic,
    description: input.agenda ?? "",
    courseId: null,
    moduleId: null,
    lessonId: null,
    instructorId: "",
    assistantInstructorId: null,
    startsAt: input.startsAt,
    endsAt: new Date(Date.parse(input.startsAt) + input.durationMinutes * 60_000).toISOString(),
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    maxStudents: 2,
    meetingType: "meeting",
    status: "scheduled",
    zoomMeetingId: null,
    recurringRuleId: null,
    parentClassId: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    createdById: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  let payload =
    settings.zoom.enabled && zoomCredsPresent()
      ? await createZoomApiMeeting(synthetic, {
          waitingRoom,
          passcode,
          meetingType: "meeting",
        })
      : null;

  if (!payload) {
    if (!isMockZoomAllowed()) {
      requireLiveZoom(
        zoomCredsPresent()
          ? "Zoom API failed to create a live meeting. Check Server-to-Server OAuth credentials and account scopes."
          : "Zoom is not configured for production. Set ZOOM_ACCOUNT_ID, ZOOM_S2S_CLIENT_ID, and ZOOM_S2S_CLIENT_SECRET, or connect an instructor Zoom account.",
      );
    }
    const zoomMeetingId = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
    const password = passcode
      ? generateToken(6)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 8) || "AviatorPass1"
      : "";
    payload = {
      liveClassId: "standalone",
      zoomMeetingId,
      zoomUuid: generateId(),
      joinUrl: `https://zoom.us/j/${zoomMeetingId}`,
      startUrl: `https://zoom.us/s/${zoomMeetingId}?zak=mock`,
      password,
      hostEmail: settings.zoom.accountEmail || null,
      waitingRoom,
      passcodeEnabled: passcode,
      coHostEmails: [],
      providerMode: "mock",
      raw: {
        mock: true,
        topic: input.topic,
        standalone: true,
        lobbyPath: input.mockJoinPath,
      },
    };
  } else if (payload.providerMode === "mock") {
    // keep
  }

  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ZOOM_MEETING_CREATED,
    entityType: "booking_zoom",
    entityId: payload.zoomMeetingId,
    metadata: { topic: input.topic, providerMode: payload.providerMode },
  });

  return {
    meetingNumber: payload.zoomMeetingId,
    joinUrl: payload.joinUrl,
    startUrl: payload.startUrl,
    password: payload.password,
    waitingRoom: payload.waitingRoom,
    providerMode: payload.providerMode,
  };
}

export type FetchZoomHostZakInput = {
  accountEmail?: string | null;
  instructorUserId?: string | null;
  meetingNumber?: string | null;
};

export type ZoomHostZakSource = "meeting-start-url";

export type ZoomHostZakProbe = {
  ready: boolean;
  hostUser: string | null;
  error: string | null;
  source: ZoomHostZakSource;
  scopes: string[];
  hasZakScope: boolean;
  usedInstructorOAuth: boolean;
};

/** Refresh start_url after create/update only — never on join. */
async function fetchZoomMeetingStartUrl(
  accessToken: string,
  meetingId: string,
): Promise<string | null> {
  const id = String(meetingId).replace(/\D/g, "");
  if (!id) return null;
  try {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { start_url?: string };
    return json.start_url?.trim() || null;
  } catch {
    return null;
  }
}

function hostZakFromStoredStartUrl(
  meeting: ZoomMeetingRecord | null,
  instructorUserId?: string | null,
): { zak: string | null } & ZoomHostZakProbe {
  const zak = zakFromStartUrl(meeting?.startUrl);
  const usedInstructorOAuth = Boolean(
    instructorUserId && meeting?.oauthUserId && meeting.oauthUserId === instructorUserId,
  );
  return {
    zak,
    ready: Boolean(zak),
    hostUser: meeting?.hostEmail || meeting?.hostId || (zak ? "meeting-start-url" : null),
    error: zak
      ? null
      : meeting
        ? "Stored Zoom start_url has no host ZAK"
        : "No stored Zoom meeting start_url",
    source: "meeting-start-url",
    scopes: getZoomS2STokenScopes(),
    hasZakScope: false,
    usedInstructorOAuth,
  };
}

/**
 * Host ZAK for Meeting SDK role 1.
 * Uses the start_url returned when the meeting was created or updated.
 * This Zoom account does not grant user:read:zak, so join never calls the token API.
 */
export async function resolveZoomHostZak(
  input: FetchZoomHostZakInput = {},
): Promise<{ zak: string | null } & ZoomHostZakProbe> {
  if (input.meetingNumber) {
    return hostZakFromStoredStartUrl(
      getZoomMeetingByNumber(input.meetingNumber),
      input.instructorUserId,
    );
  }

  const settingsEmail = input.accountEmail ?? getPlatformSettings().zoom.accountEmail;
  return {
    zak: null,
    ready: true,
    hostUser: settingsEmail ?? null,
    error: null,
    source: "meeting-start-url",
    scopes: getZoomS2STokenScopes(),
    hasZakScope: false,
    usedInstructorOAuth: false,
  };
}

export async function fetchZoomHostZak(
  accountEmail?: string | null | FetchZoomHostZakInput,
  instructorUserId?: string | null,
): Promise<string | null> {
  const input: FetchZoomHostZakInput =
    accountEmail && typeof accountEmail === "object"
      ? accountEmail
      : { accountEmail: accountEmail ?? null, instructorUserId };
  const resolved = await resolveZoomHostZak(input);
  return resolved.zak;
}

export async function probeZoomHostZak(
  input: FetchZoomHostZakInput = {},
): Promise<ZoomHostZakProbe> {
  const resolved = await resolveZoomHostZak(input);
  return {
    ready: resolved.ready,
    hostUser: resolved.hostUser,
    error: resolved.error,
    source: resolved.source,
    scopes: resolved.scopes,
    hasZakScope: resolved.hasZakScope,
    usedInstructorOAuth: resolved.usedInstructorOAuth,
  };
}

/** Attach a meeting that already exists in Zoom — no S2S create call. */
export function linkExistingZoomMeeting(input: {
  liveClass: LiveClass;
  zoomMeetingNumber: string;
  password?: string | null;
  actorId?: string | null;
}): ZoomMeetingRecord {
  const zoomMeetingId = String(input.zoomMeetingNumber).replace(/\D/g, "");
  if (zoomMeetingId.length < 9) {
    throw new ClassValidationError("A valid Zoom meeting number is required", 400);
  }
  const now = new Date().toISOString();
  const record: ZoomMeetingRecord = {
    id: generateId(),
    liveClassId: input.liveClass.id,
    zoomMeetingId,
    zoomUuid: null,
    joinUrl: appJoinUrl(input.liveClass.id, zoomMeetingId),
    startUrl: appJoinUrl(input.liveClass.id, zoomMeetingId, true),
    password: input.password?.trim() ?? "",
    hostEmail: getPlatformSettings().zoom.accountEmail || null,
    waitingRoom: getPlatformSettings().zoom.defaultWaitingRoom,
    passcodeEnabled: Boolean(input.password?.trim()),
    coHostEmails: [],
    providerMode: "zoom",
    hostId: null,
    timezone: input.liveClass.timezone,
    durationMinutes: input.liveClass.durationMinutes,
    startTime: input.liveClass.startsAt,
    status: "scheduled",
    oauthUserId: null,
    participantCount: null,
    raw: { attached: true, zoomMeetingId },
    createdAt: now,
    updatedAt: now,
  };

  writeClassesDb((d) => {
    d.zoomMeetings = d.zoomMeetings.filter((z) => z.liveClassId !== input.liveClass.id);
    d.zoomMeetings.push(record);
    const idx = d.classes.findIndex((c) => c.id === input.liveClass.id);
    if (idx >= 0) {
      const current = d.classes[idx]!;
      d.classes[idx] = {
        ...current,
        zoomMeetingId: record.id,
        updatedAt: now,
      };
    }
  });

  return record;
}

export async function cancelStandaloneZoomMeeting(input: {
  meetingNumber: string;
  providerMode: "mock" | "zoom";
  actorId?: string | null;
}): Promise<void> {
  if (input.providerMode === "zoom" && zoomCredsPresent()) {
    const token = await getZoomAccessToken();
    if (token) {
      await fetch(`https://api.zoom.us/v2/meetings/${input.meetingNumber}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => console.error("Zoom booking cancel failed", err));
    }
  }
  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ZOOM_MEETING_CANCELLED,
    entityType: "booking_zoom",
    entityId: input.meetingNumber,
  });
}
