/**
 * Zoom background jobs — create / update / delete / refresh / sync / notify.
 */

import { enqueueJob, processQueue } from "@/services/api-platform/queue-service";
import { getLiveClass } from "@/services/classes/class-service";
import { getZoomMeetingByClassId } from "@/services/classes/zoom-service";
import {
  createInstructorZoomMeeting,
  deleteInstructorZoomMeeting,
  syncInstructorMeetings,
  updateInstructorZoomMeeting,
} from "@/services/zoom/meeting-service";
import { sendZoomMeetingNotifications, type ZoomNotifyKind } from "@/services/zoom/notifications";
import { refreshInstructorAccessToken } from "@/services/zoom/oauth-service";
import type { QueueJob } from "@/types/api-platform";

export function enqueueZoomJob(input: {
  type:
    | "zoom.meeting.create"
    | "zoom.meeting.update"
    | "zoom.meeting.delete"
    | "zoom.token.refresh"
    | "zoom.sync"
    | "zoom.notification";
  payload: Record<string, unknown>;
  processNow?: boolean;
}) {
  const job = enqueueJob({
    type: input.type,
    payload: input.payload,
    maxAttempts: 4,
  });
  if (input.processNow !== false) {
    void processQueue(8);
  }
  return job;
}

export async function runZoomJob(job: QueueJob): Promise<Record<string, unknown>> {
  const p = job.payload;
  switch (job.type) {
    case "zoom.meeting.create": {
      const liveClassId = String(p.liveClassId ?? "");
      const cls = getLiveClass(liveClassId);
      if (!cls) return { skipped: true, reason: "class_not_found" };
      const created = await createInstructorZoomMeeting({
        liveClass: cls,
        actorId: typeof p.actorId === "string" ? p.actorId : null,
      });
      return { created: Boolean(created), meetingId: created?.id ?? null };
    }
    case "zoom.meeting.update": {
      const liveClassId = String(p.liveClassId ?? "");
      const cls = getLiveClass(liveClassId);
      if (!cls) return { skipped: true, reason: "class_not_found" };
      const existing = getZoomMeetingByClassId(liveClassId);
      if (!existing) {
        const created = await createInstructorZoomMeeting({
          liveClass: cls,
          actorId: typeof p.actorId === "string" ? p.actorId : null,
        });
        return { created: Boolean(created), updated: false };
      }
      const updated = await updateInstructorZoomMeeting({
        liveClass: cls,
        existing,
        actorId: typeof p.actorId === "string" ? p.actorId : null,
      });
      return { updated };
    }
    case "zoom.meeting.delete": {
      const liveClassId = String(p.liveClassId ?? "");
      const existing = getZoomMeetingByClassId(liveClassId);
      if (!existing) return { skipped: true, reason: "meeting_not_found" };
      const deleted = await deleteInstructorZoomMeeting({
        liveClassId,
        existing,
        classTitle: typeof p.classTitle === "string" ? p.classTitle : undefined,
        actorId: typeof p.actorId === "string" ? p.actorId : null,
        notify: p.notify !== false,
      });
      return { deleted };
    }
    case "zoom.token.refresh": {
      const userId = String(p.userId ?? "");
      await refreshInstructorAccessToken(userId);
      return { refreshed: true, userId };
    }
    case "zoom.sync": {
      const userId = String(p.userId ?? "");
      return await syncInstructorMeetings(userId);
    }
    case "zoom.notification": {
      return await sendZoomMeetingNotifications({
        kind: String(p.kind ?? "created") as ZoomNotifyKind,
        liveClassId: String(p.liveClassId ?? ""),
        classTitle: String(p.classTitle ?? "Live class"),
        startsAt: typeof p.startsAt === "string" ? p.startsAt : undefined,
        actorId: typeof p.actorId === "string" ? p.actorId : null,
        userIds: Array.isArray(p.userIds) ? p.userIds.map(String) : undefined,
      });
    }
    default:
      return { ok: true };
  }
}
