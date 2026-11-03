/**
 * Zoom meeting lifecycle notifications — in-app only.
 * Schedule / cancel / reschedule emails are owned by class-service → emailScheduleLifecycle.
 * Important lecture reminders (24h / 1h) are owned by reminder-service.
 */

import { enqueueJob, processQueue } from "@/services/api-platform/queue-service";
import { notifyUsers } from "@/services/notifications/notification-service";
import { listParticipantsForClass } from "@/services/classes/store";

export type ZoomNotifyKind = "created" | "updated" | "cancelled" | "starts_soon" | "finished";

function titles(kind: ZoomNotifyKind, classTitle: string) {
  switch (kind) {
    case "created":
      return {
        title: "Zoom meeting created",
        body: `A Zoom meeting is ready for ${classTitle}.`,
        type: "zoom.meeting.created",
      };
    case "updated":
      return {
        title: "Zoom meeting updated",
        body: `The Zoom meeting for ${classTitle} was updated.`,
        type: "zoom.meeting.updated",
      };
    case "cancelled":
      return {
        title: "Zoom meeting cancelled",
        body: `The Zoom meeting for ${classTitle} was cancelled.`,
        type: "zoom.meeting.cancelled",
      };
    case "starts_soon":
      return {
        title: "Zoom meeting starts soon",
        body: `${classTitle} is starting soon. Join from your dashboard.`,
        type: "zoom.meeting.starts_soon",
      };
    case "finished":
      return {
        title: "Zoom meeting finished",
        body: `${classTitle} has ended.`,
        type: "zoom.meeting.finished",
      };
  }
}

export function classParticipantIds(liveClassId: string): string[] {
  return listParticipantsForClass(liveClassId).map((p) => p.userId);
}

export async function sendZoomMeetingNotifications(input: {
  kind: ZoomNotifyKind;
  liveClassId: string;
  classTitle: string;
  startsAt?: string;
  actorId?: string | null;
  userIds?: string[];
}) {
  const userIds = input.userIds?.length ? input.userIds : classParticipantIds(input.liveClassId);
  if (!userIds.length) return { sent: 0 };
  const copy = titles(input.kind, input.classTitle);
  await notifyUsers(userIds, {
    title: copy.title,
    body: copy.body,
    type: copy.type,
    data: { liveClassId: input.liveClassId, kind: input.kind },
    actionUrl: `/join/${input.liveClassId}`,
    // Never email from Zoom notify — prevents Class scheduled / cancel duplicates.
    email: false,
  });
  return { sent: userIds.length };
}

export function enqueueZoomNotification(input: {
  kind: ZoomNotifyKind;
  liveClassId: string;
  classTitle: string;
  startsAt?: string;
  actorId?: string | null;
  userIds?: string[];
}) {
  const job = enqueueJob({
    type: "zoom.notification",
    payload: { ...input },
    maxAttempts: 3,
  });
  void processQueue(8);
  return job;
}
