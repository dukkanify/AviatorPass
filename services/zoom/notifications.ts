/**
 * Zoom meeting lifecycle notifications — in-app + email.
 */

import { enqueueJob, processQueue } from "@/services/api-platform/queue-service";
import { emailScheduleLifecycle } from "@/services/email/automation-service";
import { notifyUsers } from "@/services/notifications/notification-service";
import { readClassesDb } from "@/services/classes/store";

export type ZoomNotifyKind = "created" | "updated" | "cancelled" | "starts_soon" | "finished";

function titles(kind: ZoomNotifyKind, classTitle: string) {
  switch (kind) {
    case "created":
      return {
        title: "Zoom meeting created",
        body: `A Zoom meeting is ready for ${classTitle}.`,
        type: "zoom.meeting.created",
        emailEvent: "schedule" as const,
        emailDetail: "A Zoom meeting has been created for this live class.",
      };
    case "updated":
      return {
        title: "Zoom meeting updated",
        body: `The Zoom meeting for ${classTitle} was updated.`,
        type: "zoom.meeting.updated",
        emailEvent: "reschedule" as const,
        emailDetail: "The Zoom meeting time or details changed.",
      };
    case "cancelled":
      return {
        title: "Zoom meeting cancelled",
        body: `The Zoom meeting for ${classTitle} was cancelled.`,
        type: "zoom.meeting.cancelled",
        emailEvent: "cancel" as const,
        emailDetail: "The Zoom meeting for this live class was removed.",
      };
    case "starts_soon":
      return {
        title: "Zoom meeting starts soon",
        body: `${classTitle} is starting soon. Join from your dashboard.`,
        type: "zoom.meeting.starts_soon",
        emailEvent: null,
        emailDetail: "Your Zoom live class starts soon.",
      };
    case "finished":
      return {
        title: "Zoom meeting finished",
        body: `${classTitle} has ended.`,
        type: "zoom.meeting.finished",
        emailEvent: null,
        emailDetail: "This Zoom live class has finished.",
      };
  }
}

export function classParticipantIds(liveClassId: string): string[] {
  return readClassesDb()
    .participants.filter((p) => p.liveClassId === liveClassId)
    .map((p) => p.userId);
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
  });
  if (copy.emailEvent) {
    await emailScheduleLifecycle({
      event: copy.emailEvent,
      userIds,
      title: input.classTitle,
      when: input.startsAt ? new Date(input.startsAt).toLocaleString() : undefined,
      detail: copy.emailDetail,
      liveClassId: input.liveClassId,
      actorId: input.actorId ?? null,
    });
  }
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
