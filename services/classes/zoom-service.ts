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
import {
  displayMeetingName,
  zakFromStartUrl,
  zoomLectureAgenda,
  zoomLectureTopic,
} from "@/lib/zoom/meeting-sdk";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import { getZoomS2SCredentials } from "@/lib/zoom/s2s-credentials";
import { findUserById } from "@/services/auth/store";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { ROLES } from "@/constants/roles";
import { logActivity } from "@/services/auth/activity-log";
import { readBookingsDb, writeBookingsDb } from "@/services/bookings/store";
import {
  listParticipantsForClass,
  lookupAllLiveClasses,
  lookupLiveClass,
  lookupZoomMeetingByClassId,
  lookupZoomMeetingByNumber,
  upsertZoomMeeting,
  writeClassesDb,
} from "@/services/classes/store";
import { readMockExamsDb, writeMockExamsDb } from "@/services/mock-exams/store";
import { sanitizeJoinInfoForViewer } from "@/services/zoom/policy";
import { getIntegrationByUserId } from "@/services/zoom/store";
import { ClassValidationError } from "@/services/classes/validation";
import type { LiveClass, MeetingType, ZoomMeetingRecord } from "@/types/classes";

const START_URL_REFRESH_MS = 90 * 60_000;

/** Meeting SDK cannot join a Zoom registration meeting (error 3099). */
export const IN_APP_ZOOM_MEETING_SETTINGS = {
  approval_type: 2,
  join_before_host: true,
  meeting_authentication: false,
  mute_upon_entry: false,
  waiting_room: false,
  who_can_share_screen: "all",
  who_can_share_screen_when_someone_is_sharing: "all",
  request_permission_to_unmute_participants: false,
} as const;

/** Zoom user defaults. A meeting-level "all" is ignored while this stays "host". */
const ZOOM_HOST_PARTICIPANT_TOOLS = {
  screen_sharing: true,
  who_can_share_screen: "all",
  who_can_share_screen_when_someone_is_sharing: "all",
  request_permission_to_unmute_participants: false,
  annotation: true,
  whiteboard: true,
  remote_control: true,
} as const;

const zoomShareToolsReady = new Set<string>();

export function isZoomRegistrationJoinUrl(url: string | null | undefined): boolean {
  return /\/(?:meeting|webinar)\/register/i.test(url ?? "");
}

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
    instructorClientId: envPresent("ZOOM_INSTRUCTOR_CLIENT_ID"),
    instructorClientSecret: envPresent("ZOOM_INSTRUCTOR_CLIENT_SECRET"),
    s2sClientId: envPresent("ZOOM_S2S_CLIENT_ID"),
    s2sClientSecret: envPresent("ZOOM_S2S_CLIENT_SECRET"),
    webhookSecret: envPresent("ZOOM_WEBHOOK_SECRET"),
    secretToken: envPresent("ZOOM_SECRET_TOKEN"),
    redirectUri: envPresent("ZOOM_REDIRECT_URI"),
    meetingSdk: Boolean(getZoomMeetingSdkCredentials()),
  };
}

export function isMockZoomAllowed(): boolean {
  if (zoomCredsPresent()) return false;
  if (process.env.ALLOW_ZOOM_MOCK === "true") return true;
  if (process.env.FORBID_ZOOM_MOCK === "true") return false;
  return (
    process.env.NEXT_PUBLIC_APP_ENV !== "production" && process.env.VERCEL_ENV !== "production"
  );
}

export function isLiveZoomConfigured(): boolean {
  return zoomCredsPresent();
}

export function isPlaceholderZoomMeeting(
  meeting:
    | {
        providerMode?: string | null;
        startUrl?: string | null;
        joinUrl?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!meeting) return true;
  if ((meeting.providerMode ?? "").toLowerCase() === "mock") return true;
  const start = meeting.startUrl ?? "";
  const join = meeting.joinUrl ?? "";
  return /zak=mock/i.test(start) || /zak=mock/i.test(join);
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

type ZoomHostCandidate = { id: string; email: string };

function lectureWindow(liveClass: Pick<LiveClass, "startsAt" | "endsAt" | "durationMinutes">): {
  start: number;
  end: number;
} {
  const start = Date.parse(liveClass.startsAt);
  const end = Number.isNaN(Date.parse(liveClass.endsAt))
    ? start + liveClass.durationMinutes * 60_000
    : Date.parse(liveClass.endsAt);
  return { start, end };
}

function sameZoomHost(meeting: ZoomMeetingRecord, host: ZoomHostCandidate): boolean {
  const id = host.id.toLowerCase();
  const email = host.email.toLowerCase();
  const meetingId = (meeting.hostId ?? "").toLowerCase();
  const meetingEmail = (meeting.hostEmail ?? "").toLowerCase();
  if (id && meetingId && meetingId === id) return true;
  if (email && meetingEmail && meetingEmail === email) return true;
  return false;
}

/** True when this Zoom user already owns another lecture at the same time. */
export function zoomHostBusy(
  host: ZoomHostCandidate,
  liveClass: Pick<LiveClass, "id" | "startsAt" | "endsAt" | "durationMinutes">,
): boolean {
  const next = lectureWindow(liveClass);
  if (Number.isNaN(next.start) || Number.isNaN(next.end)) return false;
  return lookupAllLiveClasses().some((other) => {
    if (
      other.id === liveClass.id ||
      other.deletedAt ||
      other.status === "cancelled" ||
      other.status === "completed" ||
      other.status === "rescheduled"
    ) {
      return false;
    }
    const current = lectureWindow(other);
    if (!(current.start < next.end && next.start < current.end)) return false;
    const meeting = lookupZoomMeetingByClassId(other.id);
    return Boolean(meeting && sameZoomHost(meeting, host));
  });
}

async function listZoomHostCandidates(token: string): Promise<ZoomHostCandidate[]> {
  try {
    const res = await fetch("https://api.zoom.us/v2/users?status=active&page_size=100", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      users?: Array<{ id?: string; email?: string; type?: number }>;
    };
    return (json.users ?? [])
      .map((user) => ({
        id: user.id?.trim() || user.email?.trim() || "",
        email: user.email?.trim() || "",
        type: user.type ?? 1,
      }))
      .filter((user) => user.id)
      .sort((a, b) => Number(b.type === 2) - Number(a.type === 2))
      .map(({ id, email }) => ({ id, email }));
  } catch {
    return [];
  }
}

/** Put overlapping lectures on different Zoom users so they can run together. */
async function chooseZoomHostUser(
  token: string,
  liveClass: LiveClass,
  fallback: string,
): Promise<string> {
  const hosts = await listZoomHostCandidates(token);
  const free = hosts.find((host) => !zoomHostBusy(host, liveClass));
  return free?.id || fallback;
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
export async function getZoomS2SAccessToken(): Promise<string | null> {
  return getZoomAccessToken();
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

function describeZoomLecture(liveClass: {
  id: string;
  title: string;
  instructorId: string;
  description?: string | null;
}): {
  topic: string;
  agenda: string;
} {
  const instructor = findUserById(liveClass.instructorId);
  const instructorName = instructor ? displayMeetingName(instructor) : null;
  const studentNames = listParticipantsForClass(liveClass.id)
    .filter((person) => person.role === "participant")
    .flatMap((person) => {
      const user = findUserById(person.userId);
      return user ? [displayMeetingName(user)] : [];
    });
  const agenda = [
    zoomLectureAgenda({ instructorName, studentNames }),
    liveClass.description?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);
  return {
    topic: zoomLectureTopic(liveClass.title, instructorName),
    agenda,
  };
}

async function createZoomApiMeeting(
  liveClass: LiveClass,
  opts: { waitingRoom: boolean; passcode: boolean; meetingType: MeetingType },
): Promise<Omit<ZoomMeetingRecord, "id" | "createdAt" | "updatedAt"> | null> {
  const token = await getZoomAccessToken();
  if (!token) return null;

  const settings = getPlatformSettings();
  const roster = describeZoomLecture(liveClass);
  const body = {
    topic: roster.topic,
    type: 2,
    start_time: liveClass.startsAt,
    duration: liveClass.durationMinutes,
    timezone: liveClass.timezone,
    agenda: roster.agenda,
    password: opts.passcode ? undefined : "",
    settings: {
      host_video: true,
      participant_video: true,
      ...IN_APP_ZOOM_MEETING_SETTINGS,
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

  let user = await chooseZoomHostUser(
    token,
    liveClass,
    resolveZoomS2SUser(settings.zoom.accountEmail),
  );
  await ensureZoomHostParticipantTools(token, user);
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
    waitingRoom: false,
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
  const { createInstructorZoomMeeting } = await import("@/services/zoom/meeting-service");
  const {
    assertInstructorZoomConnected,
    getValidInstructorAccessToken,
    getIntegrationByUserId,
    isS2SDelegateIntegration,
    hasPersonalInstructorZoom,
  } = await import("@/services/zoom/oauth-service");
  const { PermissionError } = await import("@/services/auth/permissions");

  const instructorToken = await getValidInstructorAccessToken(input.liveClass.instructorId);
  const integration = getIntegrationByUserId(input.liveClass.instructorId);
  const platformEmail = getPlatformSettings().zoom.accountEmail;
  const personalOAuth = Boolean(
    instructorToken &&
    !isS2SDelegateIntegration(integration) &&
    hasPersonalInstructorZoom(integration, platformEmail),
  );

  // Live classes always host on the instructor's personal Zoom OAuth account —
  // never the shared platform host (ceo@aviatorpass.com / S2S).
  if (personalOAuth) {
    try {
      const instructorMeeting = await createInstructorZoomMeeting({
        liveClass: input.liveClass,
        actorId: input.actorId,
      });
      if (instructorMeeting) return instructorMeeting;
    } catch (error) {
      console.error("Instructor Zoom create failed", error);
      throw new ClassValidationError(
        error instanceof Error
          ? error.message
          : "Unable to create a Zoom meeting on the instructor account.",
        503,
      );
    }
  }

  if (!isMockZoomAllowed()) {
    try {
      assertInstructorZoomConnected(input.liveClass.instructorId);
    } catch (error) {
      if (error instanceof PermissionError) {
        throw new ClassValidationError(
          "Please connect your Zoom account before creating a live class.",
          409,
        );
      }
      throw error;
    }
    if (!personalOAuth) {
      throw new ClassValidationError(
        "Please connect your Zoom account before creating a live class.",
        409,
      );
    }
  }

  const settings = getPlatformSettings();
  const waitingRoom = false;
  const passcode = input.passcode ?? settings.zoom.defaultPasscode;
  const meetingType =
    input.meetingType ?? settings.zoom.defaultMeetingType ?? input.liveClass.meetingType;

  // Dev/mock only — production live classes never fall back to platform S2S host.
  const payload = mockMeeting(input.liveClass, { waitingRoom, passcode, meetingType });

  const now = new Date().toISOString();
  const record: ZoomMeetingRecord = {
    id: generateId(),
    ...payload,
    oauthUserId: input.liveClass.instructorId,
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
      via: personalOAuth ? "instructor_oauth" : "mock_dev",
    },
  });

  return record;
}

/** Single-flight create/ensure so parallel join requests do not spam Zoom meetings. */
const ensureMeetingInFlight = new Map<string, Promise<ZoomMeetingRecord | null>>();

export async function ensureLiveMeetingForClass(
  liveClassId: string,
  actorId?: string | null,
): Promise<ZoomMeetingRecord | null> {
  const inflight = ensureMeetingInFlight.get(liveClassId);
  if (inflight) return inflight;

  const promise = (async () => {
    const liveClass = lookupLiveClass(liveClassId);
    if (!liveClass || liveClass.deletedAt || liveClass.status === "cancelled") {
      return lookupZoomMeetingByClassId(liveClassId);
    }
    const existing = lookupZoomMeetingByClassId(liveClassId);
    if (existing && !isPlaceholderZoomMeeting(existing)) {
      return ensureInAppJoinSettings(existing);
    }
    if (!zoomCredsPresent() && existing) return existing;
    // Re-check after any await gap before creating a remote meeting.
    const raced = lookupZoomMeetingByClassId(liveClassId);
    if (raced && !isPlaceholderZoomMeeting(raced)) {
      return ensureInAppJoinSettings(raced);
    }
    return createMeetingForClass({ liveClass, actorId });
  })().finally(() => {
    if (ensureMeetingInFlight.get(liveClassId) === promise) {
      ensureMeetingInFlight.delete(liveClassId);
    }
  });

  ensureMeetingInFlight.set(liveClassId, promise);
  return promise;
}

type ZoomMeetingDetails = {
  startUrl: string | null;
  joinUrl: string | null;
  password: string | null;
  topic: string | null;
  agenda: string | null;
  approvalType: number | null;
  joinBeforeHost: boolean | null;
  meetingAuthentication: boolean | null;
  waitingRoom: boolean | null;
  whoCanShareScreen: string | null;
  whoCanShareWhenSomeoneIsSharing: string | null;
  requestPermissionToUnmute: boolean | null;
};

async function fetchZoomMeetingDetails(
  accessToken: string,
  meetingId: string,
): Promise<ZoomMeetingDetails | null> {
  const id = String(meetingId).replace(/\D/g, "");
  if (!id) return null;
  try {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      start_url?: string;
      join_url?: string;
      password?: string;
      topic?: string;
      agenda?: string;
      settings?: {
        approval_type?: number;
        join_before_host?: boolean;
        meeting_authentication?: boolean;
        waiting_room?: boolean;
        who_can_share_screen?: string;
        who_can_share_screen_when_someone_is_sharing?: string;
        request_permission_to_unmute_participants?: boolean;
      };
    };
    return {
      startUrl: json.start_url?.trim() || null,
      joinUrl: json.join_url?.trim() || null,
      password: json.password?.trim() || null,
      topic: json.topic?.trim() || null,
      agenda: json.agenda?.trim() || null,
      approvalType:
        typeof json.settings?.approval_type === "number" ? json.settings.approval_type : null,
      joinBeforeHost:
        typeof json.settings?.join_before_host === "boolean"
          ? json.settings.join_before_host
          : null,
      meetingAuthentication:
        typeof json.settings?.meeting_authentication === "boolean"
          ? json.settings.meeting_authentication
          : null,
      waitingRoom:
        typeof json.settings?.waiting_room === "boolean" ? json.settings.waiting_room : null,
      whoCanShareScreen: json.settings?.who_can_share_screen?.trim() || null,
      whoCanShareWhenSomeoneIsSharing:
        json.settings?.who_can_share_screen_when_someone_is_sharing?.trim() || null,
      requestPermissionToUnmute:
        typeof json.settings?.request_permission_to_unmute_participants === "boolean"
          ? json.settings.request_permission_to_unmute_participants
          : null,
    };
  } catch {
    return null;
  }
}

/** Turn off Zoom registration on an existing meeting so students join inside AviatorPass. */
export async function ensureInAppJoinSettings(
  meeting: ZoomMeetingRecord,
): Promise<ZoomMeetingRecord> {
  if (meeting.providerMode !== "zoom" || !zoomCredsPresent()) return meeting;
  const token = await getZoomAccessToken();
  if (!token) return meeting;

  const shareToolsChanged = await ensureZoomHostParticipantTools(
    token,
    meeting.hostId || meeting.hostEmail,
  );
  const liveClass = lookupLiveClass(meeting.liveClassId);
  const roster = liveClass ? describeZoomLecture(liveClass) : null;
  const current = await fetchZoomMeetingDetails(token, meeting.zoomMeetingId);
  const needsPatch =
    !current ||
    current.approvalType !== 2 ||
    current.joinBeforeHost === false ||
    current.meetingAuthentication === true ||
    current.waitingRoom === true ||
    current.whoCanShareScreen !== "all" ||
    current.whoCanShareWhenSomeoneIsSharing === "host" ||
    current.requestPermissionToUnmute === true ||
    isZoomRegistrationJoinUrl(current.joinUrl) ||
    isZoomRegistrationJoinUrl(meeting.joinUrl) ||
    (roster != null &&
      current != null &&
      (current.topic !== roster.topic || current.agenda !== roster.agenda));

  if (needsPatch) {
    await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meeting.zoomMeetingId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(roster ? { topic: roster.topic, agenda: roster.agenda } : {}),
        settings: { ...IN_APP_ZOOM_MEETING_SETTINGS },
      }),
    }).catch((error) => console.error("Zoom in-app join settings failed", error));
  }

  const refreshed = needsPatch
    ? await fetchZoomMeetingDetails(token, meeting.zoomMeetingId)
    : current;
  if (
    shareToolsChanged ||
    (current?.whoCanShareScreen === "host" && refreshed?.whoCanShareScreen === "all")
  ) {
    await endZoomMeetingInstance(token, meeting.zoomMeetingId);
  }
  if (!refreshed) return meeting;

  const nextJoin =
    refreshed.joinUrl && !isZoomRegistrationJoinUrl(refreshed.joinUrl)
      ? refreshed.joinUrl
      : meeting.joinUrl;
  const next: ZoomMeetingRecord = {
    ...meeting,
    joinUrl: nextJoin,
    startUrl: refreshed.startUrl || meeting.startUrl,
    password: refreshed.password || meeting.password,
    waitingRoom: false,
    updatedAt: new Date().toISOString(),
  };
  if (
    next.joinUrl === meeting.joinUrl &&
    next.startUrl === meeting.startUrl &&
    next.password === meeting.password &&
    next.waitingRoom === meeting.waitingRoom &&
    !needsPatch
  ) {
    return meeting;
  }

  upsertZoomMeeting(next);
  return next;
}

type ZoomUserShareSettings = {
  whoCanShareScreen: string | null;
  whoCanShareWhenSomeoneIsSharing: string | null;
  requestPermissionToUnmute: boolean | null;
};

function zoomSettingsUser(hostUser: string | null | undefined): string {
  return resolveZoomS2SUser(hostUser ?? null) || "me";
}

async function fetchZoomUserShareSettings(
  token: string,
  user: string,
): Promise<ZoomUserShareSettings | null> {
  try {
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(user)}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      in_meeting?: {
        who_can_share_screen?: string;
        who_can_share_screen_when_someone_is_sharing?: string;
        request_permission_to_unmute_participants?: boolean;
      };
    };
    return {
      whoCanShareScreen: json.in_meeting?.who_can_share_screen?.trim() || null,
      whoCanShareWhenSomeoneIsSharing:
        json.in_meeting?.who_can_share_screen_when_someone_is_sharing?.trim() || null,
      requestPermissionToUnmute:
        typeof json.in_meeting?.request_permission_to_unmute_participants === "boolean"
          ? json.in_meeting.request_permission_to_unmute_participants
          : null,
    };
  } catch {
    return null;
  }
}

/** Unlock attendee screen share, camera, and unmute on the Zoom host user. */
async function ensureZoomHostParticipantTools(
  token: string,
  hostUser: string | null | undefined,
): Promise<boolean> {
  const users = [...new Set([zoomSettingsUser(hostUser), "me"])];
  let changed = false;
  for (const user of users) {
    if (zoomShareToolsReady.has(user)) continue;
    const current = await fetchZoomUserShareSettings(token, user);
    const blocked =
      !current ||
      current.whoCanShareScreen !== "all" ||
      current.whoCanShareWhenSomeoneIsSharing === "host" ||
      current.requestPermissionToUnmute === true;
    if (!blocked) {
      zoomShareToolsReady.add(user);
      continue;
    }
    const wasHostOnly =
      current?.whoCanShareScreen === "host" || current?.whoCanShareWhenSomeoneIsSharing === "host";
    try {
      const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(user)}/settings`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ in_meeting: { ...ZOOM_HOST_PARTICIPANT_TOOLS } }),
      });
      if (res.ok || res.status === 204) {
        zoomShareToolsReady.add(user);
        if (wasHostOnly) changed = true;
      } else {
        console.error("Zoom participant tools update failed", res.status);
      }
    } catch (error) {
      console.error("Zoom participant tools update failed", error);
    }
  }
  return changed;
}

/** End a running instance so the next join starts with the updated share policy. */
async function endZoomMeetingInstance(token: string, meetingId: string): Promise<void> {
  const id = String(meetingId).replace(/\D/g, "");
  if (!id) return;
  try {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "end" }),
    });
    if (!res.ok && res.status !== 404) {
      console.error("Zoom meeting end skipped", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("Zoom meeting end skipped", error);
  }
}

/** DELETE meeting as a stronger unlock when PUT end leaves host error 3000. */
async function deleteZoomMeetingInstance(token: string, meetingId: string): Promise<void> {
  const id = String(meetingId).replace(/\D/g, "");
  if (!id) return;
  try {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      console.error("Zoom meeting delete skipped", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("Zoom meeting delete skipped", error);
  }
}

export async function updateMeetingForClass(input: {
  liveClass: LiveClass;
  actorId?: string | null;
}): Promise<ZoomMeetingRecord | null> {
  const existing = lookupZoomMeetingByClassId(input.liveClass.id);
  if (!existing)
    return createMeetingForClass({ liveClass: input.liveClass, actorId: input.actorId });

  const currentHost = { id: existing.hostId ?? "", email: existing.hostEmail ?? "" };
  if ((currentHost.id || currentHost.email) && zoomHostBusy(currentHost, input.liveClass)) {
    await cancelMeetingForClass({ liveClassId: input.liveClass.id, actorId: input.actorId });
    return createMeetingForClass({ liveClass: input.liveClass, actorId: input.actorId });
  }

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
        return lookupZoomMeetingByClassId(input.liveClass.id) ?? existing;
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
          settings: { ...IN_APP_ZOOM_MEETING_SETTINGS },
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
  const existing = lookupZoomMeetingByClassId(input.liveClassId);
  if (!existing) return;

  try {
    const { deleteInstructorZoomMeeting } = await import("@/services/zoom/meeting-service");
    const instructorId =
      existing.oauthUserId || lookupLiveClass(input.liveClassId)?.instructorId || "";
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
  const meeting = lookupZoomMeetingByClassId(liveClassId);
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
  return lookupZoomMeetingByNumber(meetingNumber);
}

export type StoredZoomSession = {
  meetingNumber: string;
  startUrl: string | null;
  hostEmail?: string | null;
  hostId?: string | null;
  oauthUserId?: string | null;
  updatedAt?: string | null;
  liveClassId?: string | null;
};

function meetingNumberDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function findStoredZoomSession(
  meetingNumber: string | null | undefined,
): StoredZoomSession | null {
  const id = meetingNumberDigits(meetingNumber);
  if (!id) return null;

  const classMeeting = getZoomMeetingByNumber(id);
  if (classMeeting) {
    return {
      meetingNumber: classMeeting.zoomMeetingId,
      startUrl: classMeeting.startUrl,
      hostEmail: classMeeting.hostEmail,
      hostId: classMeeting.hostId,
      oauthUserId: classMeeting.oauthUserId,
      updatedAt: classMeeting.updatedAt,
      liveClassId: classMeeting.liveClassId,
    };
  }

  const booking = readBookingsDb().bookings.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (booking?.zoom) {
    return {
      meetingNumber: booking.zoom.meetingNumber,
      startUrl: booking.zoom.startUrl,
      updatedAt: booking.zoom.provisionedAt || booking.updatedAt,
    };
  }

  const session = readMockExamsDb().sessions.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (session?.zoom) {
    return {
      meetingNumber: session.zoom.meetingNumber,
      startUrl: session.zoom.startUrl,
      updatedAt: session.zoom.provisionedAt || session.updatedAt,
    };
  }

  return null;
}

/** Host ZAK is only for the assigned instructor or academy staff, never a student. */
function academyOversightHost(role: string): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
}

/**
 * Roster / booking gate before minting a Meeting SDK JWT.
 * CGI is not oversight-host unless assigned on the lecture.
 */
export function assertCallerMayReceiveInAppZoomSession(input: {
  userId: string;
  role: string;
  liveClassId?: string | null;
  meetingNumber?: string | null;
}): { isHost: boolean; liveClassId: string | null } {
  if (input.liveClassId) {
    const live = lookupLiveClass(input.liveClassId);
    if (!live) throw new ClassValidationError("Live class not found");
    const isHost =
      live.instructorId === input.userId ||
      live.assistantInstructorId === input.userId ||
      academyOversightHost(input.role);
    const invited = listParticipantsForClass(live.id).some(
      (p) => p.userId === input.userId && (p.role === "participant" || p.role === "cohost"),
    );
    if (!isHost && !invited) {
      throw new ClassValidationError("You are not invited to this class");
    }
    return { isHost: Boolean(isHost), liveClassId: live.id };
  }

  const id = meetingNumberDigits(input.meetingNumber);
  if (!id) throw new ClassValidationError("A valid Zoom meeting number is required", 400);

  const meeting = getZoomMeetingByNumber(id);
  if (meeting?.liveClassId) {
    return assertCallerMayReceiveInAppZoomSession({
      userId: input.userId,
      role: input.role,
      liveClassId: meeting.liveClassId,
    });
  }

  const booking = readBookingsDb().bookings.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (booking) {
    const isHost = booking.instructorId === input.userId || academyOversightHost(input.role);
    const isStudent = booking.studentId === input.userId;
    if (!isHost && !isStudent) {
      throw new ClassValidationError("You are not invited to this meeting", 403);
    }
    return { isHost, liveClassId: null };
  }

  const exam = readMockExamsDb().sessions.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (exam) {
    const isHost = exam.examinerId === input.userId || academyOversightHost(input.role);
    const isStudent = exam.studentId === input.userId;
    if (!isHost && !isStudent) {
      throw new ClassValidationError("You are not invited to this meeting", 403);
    }
    return { isHost, liveClassId: null };
  }

  throw new ClassValidationError("You are not invited to this meeting", 403);
}

export function callerMayJoinAsZoomHost(input: {
  userId: string;
  role: string;
  meetingNumber: string | null | undefined;
}): boolean {
  const id = meetingNumberDigits(input.meetingNumber);
  if (!id) return false;
  const staff = academyOversightHost(input.role);

  const meeting = getZoomMeetingByNumber(id);
  if (meeting) {
    const live = lookupLiveClass(meeting.liveClassId);
    if (!live) return staff;
    return (
      staff || live.instructorId === input.userId || live.assistantInstructorId === input.userId
    );
  }

  const booking = readBookingsDb().bookings.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (booking) return staff || booking.instructorId === input.userId;

  const exam = readMockExamsDb().sessions.find(
    (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
  );
  if (exam) return staff || exam.examinerId === input.userId;

  return false;
}

function persistRefreshedStartUrl(meetingNumber: string, startUrl: string): void {
  const id = meetingNumberDigits(meetingNumber);
  if (!id || !startUrl.trim()) return;
  const now = new Date().toISOString();

  writeClassesDb((db) => {
    const meeting = db.zoomMeetings.find((item) => item.zoomMeetingId === id);
    if (!meeting) return;
    meeting.startUrl = startUrl;
    meeting.updatedAt = now;
  });

  writeBookingsDb((db) => {
    const booking = db.bookings.find(
      (item) => meetingNumberDigits(item.zoom?.meetingNumber) === id,
    );
    if (!booking?.zoom) return;
    booking.zoom = { ...booking.zoom, startUrl, provisionedAt: now };
    booking.updatedAt = now;
  });

  writeMockExamsDb((db) => {
    const row = db.sessions.find((item) => meetingNumberDigits(item.zoom?.meetingNumber) === id);
    if (!row?.zoom) return;
    row.zoom = { ...row.zoom, startUrl, provisionedAt: now };
    row.updatedAt = now;
  });
}

export function startUrlNeedsRefresh(
  session: { startUrl?: string | null; updatedAt?: string | null } | null | undefined,
): boolean {
  if (!session) return true;
  if (!zakFromStartUrl(session.startUrl)) return true;
  const issued = Date.parse(session.updatedAt ?? "");
  if (!Number.isFinite(issued)) return false;
  return Date.now() - issued > START_URL_REFRESH_MS;
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

  let payload = zoomCredsPresent()
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
  /** Host start_url already issued to this instructor (bookings / mock exams). */
  startUrl?: string | null;
  /** When true, always PATCH+GET a fresh start_url before reading ZAK. */
  forceRefreshStartUrl?: boolean;
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

/** GET start_url after create/update, or on host join when the stored ZAK is missing/stale. */
async function fetchZoomMeetingStartUrl(
  accessToken: string,
  meetingId: string,
): Promise<string | null> {
  const details = await fetchZoomMeetingDetails(accessToken, meetingId);
  return details?.startUrl ?? null;
}

export async function refreshStoredZoomStartUrl(
  meetingNumber: string,
): Promise<StoredZoomSession | null> {
  const session = findStoredZoomSession(meetingNumber);
  if (!session) return session;

  let token: string | null = null;
  if (session.oauthUserId) {
    const { getValidInstructorAccessToken } = await import("@/services/zoom/oauth-service");
    token = await getValidInstructorAccessToken(session.oauthUserId);
  }
  if (!token && zoomCredsPresent()) {
    token = await getZoomAccessToken();
  }
  if (!token) return session;

  await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(session.meetingNumber)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).catch((error) => console.error("Zoom start_url touch failed", error));

  const refreshed = await fetchZoomMeetingStartUrl(token, session.meetingNumber);
  if (refreshed && zakFromStartUrl(refreshed)) {
    persistRefreshedStartUrl(session.meetingNumber, refreshed);
    return findStoredZoomSession(session.meetingNumber);
  }
  return session;
}

async function listZoomMeetingsForHost(
  token: string,
  host: string,
  type: "live" | "upcoming" | "scheduled" | "previous_meetings",
): Promise<Array<{ id?: number | string; start_time?: string; duration?: number }>> {
  const res = await fetch(
    `https://api.zoom.us/v2/users/${encodeURIComponent(host)}/meetings?type=${type}&page_size=30`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    meetings?: Array<{ id?: number | string; start_time?: string; duration?: number }>;
  };
  return json.meetings ?? [];
}

async function listZoomLiveMeetingsForHost(
  token: string,
  host: string,
): Promise<Array<{ id?: number | string; start_time?: string; duration?: number }>> {
  return listZoomMeetingsForHost(token, host, "live");
}

/** Local store meeting numbers that may still hold a Zoom host lock (ghost sessions). */
function collectRecentPlatformMeetingNumbers(windowMs = 48 * 60 * 60_000): string[] {
  const now = Date.now();
  const ids = new Set<string>();
  const consider = (meetingNumber: string | null | undefined, when: string | null | undefined) => {
    const id = meetingNumberDigits(meetingNumber);
    if (!id) return;
    const t = when ? Date.parse(when) : NaN;
    if (Number.isFinite(t) && Math.abs(now - t) > windowMs) return;
    ids.add(id);
  };

  for (const meeting of lookupAllLiveClasses()
    .map((cls) => lookupZoomMeetingByClassId(cls.id))
    .filter(Boolean)) {
    consider(meeting!.zoomMeetingId, meeting!.updatedAt || meeting!.createdAt);
  }

  for (const booking of readBookingsDb().bookings) {
    if (booking.zoom?.providerMode !== "zoom") continue;
    consider(booking.zoom.meetingNumber, booking.startsAt || booking.updatedAt);
  }

  for (const exam of readMockExamsDb().sessions) {
    if (exam.zoom?.providerMode !== "zoom") continue;
    consider(exam.zoom.meetingNumber, exam.startsAt || exam.updatedAt);
  }

  return [...ids];
}

async function resolveClearLiveAccessToken(
  instructorUserId?: string | null,
): Promise<string | null> {
  if (instructorUserId) {
    try {
      const { getValidInstructorAccessToken } = await import("@/services/zoom/oauth-service");
      const instructorToken = await getValidInstructorAccessToken(instructorUserId);
      if (instructorToken) return instructorToken;
    } catch (error) {
      console.error("Instructor Zoom token unavailable for clear-live", error);
    }
  }
  if (!zoomCredsPresent()) return null;
  return getZoomAccessToken();
}

/**
 * End live Zoom meetings for the classroom host account.
 * Prefers the instructor OAuth token when available so cleanup targets the
 * same Zoom user that owns the Meeting SDK host ZAK (not only S2S "me").
 * Keeps `keepMeetingNumber` when provided. `endMeetingNumbers` force-ends
 * specific meetings even when Zoom's live list is empty (ghost sessions).
 */
export async function clearZoomHostLiveMeetings(input?: {
  keepMeetingNumber?: string | null;
  force?: boolean;
  instructorUserId?: string | null;
  endMeetingNumbers?: string[] | null;
}): Promise<{
  ended: string[];
  kept: string[];
  blocked: string[];
  deleted: string[];
  liveRemaining: string[];
}> {
  const ended: string[] = [];
  const kept: string[] = [];
  const blocked: string[] = [];
  const deleted: string[] = [];
  const token = await resolveClearLiveAccessToken(input?.instructorUserId);
  if (!token) return { ended, kept, blocked, deleted, liveRemaining: [] };

  const keep = meetingNumberDigits(input?.keepMeetingNumber);
  const settings = getPlatformSettings();
  const keepSession = keep ? findStoredZoomSession(keep) : null;
  const keepMeeting = keep ? getZoomMeetingByNumber(keep) : null;
  const instructorIntegration = input?.instructorUserId
    ? getIntegrationByUserId(input.instructorUserId)
    : null;
  const hosts = Array.from(
    new Set(
      [
        "me",
        settings.zoom.accountEmail,
        keepSession?.hostId,
        keepSession?.hostEmail,
        keepMeeting?.hostId,
        keepMeeting?.hostEmail,
        instructorIntegration?.zoomUserId,
        instructorIntegration?.zoomEmail,
      ]
        .map((h) => (h || "").trim())
        .filter(Boolean),
    ),
  );

  const seen = new Set<string>();
  const now = Date.now();
  const graceMs = 15 * 60_000;

  const maybeEnd = async (id: string, opts?: { allowDelete?: boolean }) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (keep && id === keep) {
      kept.push(id);
      return;
    }
    const stored = getZoomMeetingByNumber(id);
    const cls = stored?.liveClassId ? lookupLiveClass(stored.liveClassId) : null;
    if (!input?.force && cls) {
      const closed = cls.status === "completed" || cls.status === "cancelled";
      const start = Date.parse(cls.startsAt);
      const end = Date.parse(cls.endsAt);
      const inLiveWindow =
        !closed &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        now >= start &&
        now <= end + graceMs;
      if (inLiveWindow) {
        blocked.push(id);
        return;
      }
    }
    await endZoomMeetingInstance(token, id);
    ended.push(id);
    // Only DELETE meetings Zoom reported as live (or explicitly listed).
    // Local upcoming booking IDs are ended, not deleted, so future sessions survive.
    if (input?.force && opts?.allowDelete) {
      await deleteZoomMeetingInstance(token, id);
      deleted.push(id);
    }
  };

  for (const host of hosts) {
    const live = await listZoomLiveMeetingsForHost(token, host);
    for (const meeting of live) {
      await maybeEnd(meetingNumberDigits(String(meeting.id ?? "")), { allowDelete: true });
    }

    // Zoom error 3000 often remains after type=live is empty — end upcoming
    // meetings whose start window has already opened (ghost / stuck hosts).
    if (input?.force) {
      const upcoming = await listZoomMeetingsForHost(token, host, "upcoming");
      for (const meeting of upcoming) {
        const start = meeting.start_time ? Date.parse(meeting.start_time) : NaN;
        const durationMs = Math.max(1, Number(meeting.duration) || 60) * 60_000;
        const opened =
          Number.isFinite(start) &&
          now >= start - 15 * 60_000 &&
          now <= start + durationMs + graceMs;
        if (opened) {
          await maybeEnd(meetingNumberDigits(String(meeting.id ?? "")), {
            allowDelete: true,
          });
        }
      }
    }
  }

  for (const raw of input?.endMeetingNumbers ?? []) {
    await maybeEnd(meetingNumberDigits(raw), { allowDelete: true });
  }

  // Force path: end locally known recent platform meetings Zoom omitted from type=live.
  if (input?.force) {
    for (const id of collectRecentPlatformMeetingNumbers()) {
      await maybeEnd(id, { allowDelete: false });
    }
  }

  const liveRemaining = new Set<string>();
  for (const host of hosts) {
    for (const meeting of await listZoomLiveMeetingsForHost(token, host)) {
      const id = meetingNumberDigits(String(meeting.id ?? ""));
      if (id) liveRemaining.add(id);
    }
  }

  return { ended, kept, blocked, deleted, liveRemaining: [...liveRemaining] };
}

/**
 * Detect whether the Zoom host already has another live meeting.
 * Read-only — never ends unrelated meetings on join (Super Admin clear-live
 * remains the explicit recovery path).
 */
export async function zoomHostBlockedByAnotherLiveMeeting(
  meetingNumber: string | null | undefined,
  instructorUserId?: string | null,
): Promise<boolean> {
  try {
    const current = meetingNumberDigits(meetingNumber);
    if (!current) return false;
    const token = await resolveClearLiveAccessToken(instructorUserId);
    if (!token) return false;

    const settings = getPlatformSettings();
    const keepMeeting = getZoomMeetingByNumber(current);
    const instructorIntegration = instructorUserId
      ? getIntegrationByUserId(instructorUserId)
      : null;
    // Only probe the meeting owner / instructor Zoom user — not the full fan-out
    // used by admin clear-live (which can touch unrelated hosts).
    const hosts = Array.from(
      new Set(
        [
          instructorIntegration?.zoomUserId,
          instructorIntegration?.zoomEmail,
          keepMeeting?.hostId,
          keepMeeting?.hostEmail,
          "me",
        ]
          .map((h) => (h || "").trim())
          .filter(Boolean),
      ),
    );
    // Prefer instructor identity; fall back to platform account only when listing
    // returns empty (still never ends meetings here).
    if (!hosts.includes(settings.zoom.accountEmail || "") && settings.zoom.accountEmail) {
      /* intentional: do not add platform email — avoids treating CEO live sessions as this instructor */
    }

    for (const host of hosts) {
      const meetings = await listZoomLiveMeetingsForHost(token, host);
      for (const meeting of meetings) {
        const id = meetingNumberDigits(String(meeting.id ?? ""));
        if (id && id !== current) return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Zoom live-meeting probe skipped", error);
    return false;
  }
}

/**
 * Host ZAK for Meeting SDK role 1.
 * Uses the start_url returned when the meeting was created or updated.
 * This Zoom account does not grant user:read:zak, so join never calls the token API.
 * If that start_url has no ZAK or is older than 90 minutes, refresh it on host join.
 */
export async function resolveZoomHostZak(
  input: FetchZoomHostZakInput = {},
): Promise<{ zak: string | null } & ZoomHostZakProbe> {
  if (input.meetingNumber) {
    let session = findStoredZoomSession(input.meetingNumber);
    if (!session && input.startUrl) {
      session = {
        meetingNumber: meetingNumberDigits(input.meetingNumber),
        startUrl: input.startUrl,
      };
    }
    // Host join passes forceRefreshStartUrl so ZAK is rotated each start.
    // Otherwise only refresh when the stored start_url is missing/stale.
    const shouldRefresh =
      Boolean(session) && (input.forceRefreshStartUrl || startUrlNeedsRefresh(session));
    if (shouldRefresh && (zoomCredsPresent() || input.instructorUserId)) {
      session = (await refreshStoredZoomStartUrl(session!.meetingNumber)) ?? session;
    }
    const classMeeting = getZoomMeetingByNumber(input.meetingNumber);
    const zak = zakFromStartUrl(session?.startUrl ?? input.startUrl);
    const usedInstructorOAuth = Boolean(
      input.instructorUserId &&
      classMeeting?.oauthUserId &&
      classMeeting.oauthUserId === input.instructorUserId,
    );
    return {
      zak,
      ready: Boolean(zak),
      hostUser:
        session?.hostEmail ||
        session?.hostId ||
        classMeeting?.hostEmail ||
        (zak ? "meeting-start-url" : null),
      error: zak
        ? null
        : session || input.startUrl
          ? "Stored Zoom start_url has no host ZAK"
          : "No stored Zoom meeting start_url",
      source: "meeting-start-url",
      scopes: getZoomS2STokenScopes(),
      hasZakScope: false,
      usedInstructorOAuth,
    };
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
    waitingRoom: false,
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
