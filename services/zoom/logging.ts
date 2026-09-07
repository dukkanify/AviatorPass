/**
 * Structured Zoom integration logs (ops + activity). Tokens are never logged.
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity } from "@/services/auth/activity-log";
import { writeOpsLog } from "@/services/ops/logging-service";
import type { ZoomEventName } from "@/types/zoom-oauth";

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const blocked = new Set([
    "access_token",
    "refresh_token",
    "accessToken",
    "refreshToken",
    "start_url",
    "startUrl",
    "client_secret",
    "clientSecret",
    "authorization",
    "password",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (blocked.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function logZoomEvent(input: {
  event: ZoomEventName;
  level?: "info" | "warn" | "error";
  message: string;
  userId?: string | null;
  details?: Record<string, unknown>;
  path?: string;
}) {
  writeOpsLog({
    level:
      input.level ??
      (input.event.includes("error") || input.event.includes("failure") ? "error" : "info"),
    category: "application",
    message: `[zoom] ${input.message}`.slice(0, 2000),
    details: { event: input.event, ...sanitizeDetails(input.details) },
    path: input.path ?? "/api/integrations/zoom",
    userId: input.userId ?? null,
  });
}

export async function logZoomActivity(input: {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await logActivity({
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType ?? "zoom_integration",
    entityId: input.entityId ?? null,
    metadata: sanitizeDetails(input.metadata) ?? {},
  });
}

export const ZOOM_ACTIVITY = {
  OAUTH_CONNECTED: ACTIVITY_ACTIONS.ZOOM_OAUTH_CONNECTED,
  OAUTH_FAILED: ACTIVITY_ACTIONS.ZOOM_OAUTH_FAILED,
  OAUTH_DISCONNECTED: ACTIVITY_ACTIONS.ZOOM_OAUTH_DISCONNECTED,
  TOKEN_REFRESHED: ACTIVITY_ACTIONS.ZOOM_TOKEN_REFRESHED,
  SYNCED: ACTIVITY_ACTIONS.ZOOM_SYNCED,
  WEBHOOK: ACTIVITY_ACTIONS.ZOOM_WEBHOOK,
  MEETING_CREATED: ACTIVITY_ACTIONS.ZOOM_MEETING_CREATED,
  MEETING_UPDATED: ACTIVITY_ACTIONS.ZOOM_MEETING_UPDATED,
  MEETING_CANCELLED: ACTIVITY_ACTIONS.ZOOM_MEETING_CANCELLED,
};
