/**
 * Zoom domain events — log, optional outbound webhook dispatch, no secrets.
 */

import { dispatchWebhookEvent } from "@/services/api-platform/webhook-service";
import { logZoomEvent } from "@/services/zoom/logging";
import type { ZoomEventName } from "@/types/zoom-oauth";

export function emitZoomEvent(input: {
  event: ZoomEventName;
  userId?: string | null;
  message: string;
  level?: "info" | "warn" | "error";
  details?: Record<string, unknown>;
  dispatchOutbound?: boolean;
}) {
  logZoomEvent({
    event: input.event,
    userId: input.userId,
    message: input.message,
    level: input.level,
    details: input.details,
  });

  if (input.dispatchOutbound) {
    try {
      dispatchWebhookEvent(input.event, {
        userId: input.userId ?? null,
        ...input.details,
      });
    } catch (error) {
      logZoomEvent({
        event: "zoom.api.error",
        level: "warn",
        userId: input.userId,
        message: "Outbound Zoom event dispatch failed",
        details: { error: error instanceof Error ? error.message : "unknown" },
      });
    }
  }
}
