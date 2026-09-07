/**
 * Instructor Zoom General OAuth — tokens never leave the server unencrypted.
 */

export type ZoomIntegrationStatus = "connected" | "reconnect_required" | "disconnected";

export type ZoomMeetingLifecycleStatus =
  "waiting" | "started" | "finished" | "scheduled" | "cancelled";

export interface ZoomProfile {
  zoomUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  timezone: string | null;
  accountId: string | null;
  type: number | null;
}

export interface ZoomIntegrationRecord {
  id: string;
  userId: string;
  zoomUserId: string;
  zoomEmail: string;
  /** AES-256-GCM ciphertext — never return to clients */
  accessToken: string;
  /** AES-256-GCM ciphertext — never return to clients */
  refreshToken: string;
  expiresAt: string;
  connectedAt: string;
  lastSyncAt: string | null;
  status: ZoomIntegrationStatus;
  scopes: string;
  cachedProfile: ZoomProfile | null;
  profileCachedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ZoomIntegrationPublic {
  connected: boolean;
  status: ZoomIntegrationStatus;
  zoomEmail: string | null;
  zoomUserId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  oauthConfigured: boolean;
  needsReconnect: boolean;
}

export interface ZoomOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface ZoomApiMeeting {
  id: number | string;
  uuid?: string;
  host_id?: string;
  topic?: string;
  agenda?: string;
  type?: number;
  status?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  password?: string;
  join_url?: string;
  start_url?: string;
  created_at?: string;
}

export interface ZoomMeetingCreateInput {
  topic: string;
  agenda: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
}

export type ZoomJobType =
  | "zoom.meeting.create"
  | "zoom.meeting.update"
  | "zoom.meeting.delete"
  | "zoom.token.refresh"
  | "zoom.sync"
  | "zoom.notification";

export type ZoomEventName =
  | "zoom.oauth.success"
  | "zoom.oauth.failure"
  | "zoom.oauth.disconnected"
  | "zoom.meeting.created"
  | "zoom.meeting.updated"
  | "zoom.meeting.deleted"
  | "zoom.token.refreshed"
  | "zoom.api.error"
  | "zoom.webhook"
  | "zoom.sync.completed";
