/**
 * Zoom Marketplace webhook verification + meeting lifecycle events.
 */

import { createHmac, timingSafeEqual } from "crypto";

import { writeClassesDb } from "@/services/classes/store";
import { getZoomOAuthConfig } from "@/services/zoom/config";
import { emitZoomEvent } from "@/services/zoom/events";
import { logZoomActivity, ZOOM_ACTIVITY } from "@/services/zoom/logging";
import { enqueueZoomNotification } from "@/services/zoom/notifications";
import type { ZoomMeetingRecord } from "@/types/classes";

export function verifyZoomWebhookSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
}): boolean {
  const secret = getZoomOAuthConfig().secretToken || getZoomOAuthConfig().webhookSecret;
  if (!secret) return false;
  const message = `v0:${input.timestamp}:${input.rawBody}`;
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  const expected = `v0=${digest}`;
  const provided = input.signature.startsWith("v0=") ? input.signature : `v0=${input.signature}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function zoomUrlValidationResponse(plainToken: string): {
  plainToken: string;
  encryptedToken: string;
} {
  const secret = getZoomOAuthConfig().secretToken || getZoomOAuthConfig().webhookSecret;
  const encryptedToken = createHmac("sha256", secret).update(plainToken).digest("hex");
  return { plainToken, encryptedToken };
}

function meetingObject(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.payload;
  if (nested && typeof nested === "object") {
    const obj = (nested as { object?: Record<string, unknown> }).object;
    if (obj) return obj;
  }
  if (payload.object && typeof payload.object === "object") {
    return payload.object as Record<string, unknown>;
  }
  return payload;
}

export async function handleZoomWebhookEvent(payload: Record<string, unknown>): Promise<{
  event: string;
  handled: boolean;
}> {
  const event = String(payload.event ?? payload.type ?? "zoom.unknown");
  emitZoomEvent({
    event: "zoom.webhook",
    message: `Webhook ${event}`,
    details: { event },
  });
  await logZoomActivity({
    action: ZOOM_ACTIVITY.WEBHOOK,
    metadata: { event },
  });

  if (event === "endpoint.url_validation") {
    return { event, handled: true };
  }

  const object = meetingObject(payload);
  const zoomMeetingId = String(object.id ?? object.uuid ?? "");
  if (!zoomMeetingId) return { event, handled: false };

  const now = new Date().toISOString();
  let liveClassId: string | null = null;
  let classTitle = "Live class";
  let meetingStatus: ZoomMeetingRecord["status"] = null;

  if (event.includes("started")) meetingStatus = "started";
  else if (event.includes("ended") || event.includes("finished")) meetingStatus = "finished";
  else if (event.includes("deleted") || event.includes("cancelled")) meetingStatus = "cancelled";

  writeClassesDb((d) => {
    const idx = d.zoomMeetings.findIndex(
      (z) => z.zoomMeetingId === zoomMeetingId || z.zoomUuid === zoomMeetingId,
    );
    if (idx < 0) return;
    const current = d.zoomMeetings[idx]!;
    liveClassId = current.liveClassId;
    d.zoomMeetings[idx] = {
      ...current,
      status: meetingStatus ?? current.status,
      updatedAt: now,
    };
    const clsIdx = d.classes.findIndex((c) => c.id === current.liveClassId);
    if (clsIdx >= 0) {
      const cls = d.classes[clsIdx]!;
      classTitle = cls.title;
      if (meetingStatus === "started" && cls.status === "scheduled") {
        d.classes[clsIdx] = { ...cls, status: "live", updatedAt: now };
      }
      if (meetingStatus === "finished" && (cls.status === "live" || cls.status === "scheduled")) {
        d.classes[clsIdx] = { ...cls, status: "completed", updatedAt: now };
      }
    }
  });

  if (liveClassId && meetingStatus === "finished") {
    enqueueZoomNotification({
      kind: "finished",
      liveClassId,
      classTitle,
    });
  }

  return { event, handled: Boolean(liveClassId) };
}
