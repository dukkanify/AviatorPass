/**
 * Zoom ownership and viewer policies.
 */

import { ROLES } from "@/constants/roles";
import { rewriteAppAbsoluteUrl } from "@/lib/site-origin";
import { PermissionError } from "@/services/auth/permissions";
import { getIntegrationByUserId } from "@/services/zoom/store";
import type { UserProfile } from "@/types";
import type { ZoomMeetingRecord } from "@/types/classes";

export function canManageOwnZoom(user: UserProfile): boolean {
  return (
    user.role === ROLES.INSTRUCTOR ||
    user.role === ROLES.CHIEF_GROUND_INSTRUCTOR ||
    user.role === ROLES.ADMIN ||
    user.role === ROLES.SUPER_ADMIN
  );
}

export function assertCanManageOwnZoom(user: UserProfile): void {
  if (!canManageOwnZoom(user)) {
    throw new PermissionError("Zoom integration is available to instructors only", 403);
  }
}

export function assertOwnsIntegration(userId: string): void {
  const row = getIntegrationByUserId(userId);
  if (!row) {
    throw new PermissionError("Connect Zoom before performing this action", 409);
  }
}

export function isClassHost(input: {
  userId: string;
  instructorId: string;
  assistantInstructorId?: string | null;
  role?: string;
}): boolean {
  if (input.role === ROLES.SUPER_ADMIN || input.role === ROLES.ADMIN) return true;
  return input.userId === input.instructorId || input.userId === input.assistantInstructorId;
}

export function sanitizeJoinInfoForViewer(
  meeting: ZoomMeetingRecord | null,
  isHost: boolean,
): {
  zoomMeetingId: string;
  joinUrl: string;
  startUrl: string | null;
  password: string;
  waitingRoom: boolean;
  providerMode: "mock" | "zoom";
  status: string | null;
  timezone: string | null;
  durationMinutes: number | null;
  startTime: string | null;
  hostId: string | null;
  participantCount: number | null;
} | null {
  if (!meeting) return null;
  return {
    zoomMeetingId: meeting.zoomMeetingId,
    joinUrl: rewriteAppAbsoluteUrl(meeting.joinUrl),
    startUrl: isHost ? rewriteAppAbsoluteUrl(meeting.startUrl) : null,
    password: meeting.password,
    waitingRoom: meeting.waitingRoom,
    providerMode: meeting.providerMode,
    status: meeting.status ?? null,
    timezone: meeting.timezone ?? null,
    durationMinutes: meeting.durationMinutes ?? null,
    startTime: meeting.startTime ?? null,
    hostId: isHost ? (meeting.hostId ?? null) : null,
    participantCount: isHost ? (meeting.participantCount ?? null) : null,
  };
}

export function publicIntegrationView(
  userId: string,
  oauthConfigured: boolean,
): {
  connected: boolean;
  status: "connected" | "reconnect_required" | "disconnected";
  zoomEmail: string | null;
  zoomUserId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  oauthConfigured: boolean;
  needsReconnect: boolean;
} {
  const row = getIntegrationByUserId(userId);
  if (!row) {
    return {
      connected: false,
      status: "disconnected",
      zoomEmail: null,
      zoomUserId: null,
      connectedAt: null,
      lastSyncAt: null,
      oauthConfigured,
      needsReconnect: false,
    };
  }
  return {
    connected: row.status === "connected",
    status: row.status,
    zoomEmail: row.zoomEmail,
    zoomUserId: row.zoomUserId,
    connectedAt: row.connectedAt,
    lastSyncAt: row.lastSyncAt,
    oauthConfigured,
    needsReconnect: row.status === "reconnect_required",
  };
}
