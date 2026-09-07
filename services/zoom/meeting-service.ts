/**
 * Instructor-owned Zoom meetings for live classes.
 */

import { generateId } from "@/lib/security/crypto";
import { getCourseById } from "@/services/courses/course-service";
import { findUserById } from "@/services/auth/store";
import { readClassesDb, writeClassesDb } from "@/services/classes/store";
import {
  createZoomUserMeeting,
  deleteZoomUserMeeting,
  getZoomMeetingParticipantCount,
  getZoomUserMeeting,
  instructorMeetingPayload,
  updateZoomUserMeeting,
  ZoomApiError,
} from "@/services/zoom/client";
import { emitZoomEvent } from "@/services/zoom/events";
import { logZoomActivity, ZOOM_ACTIVITY } from "@/services/zoom/logging";
import { enqueueZoomNotification } from "@/services/zoom/notifications";
import { getValidInstructorAccessToken, instructorTimezone } from "@/services/zoom/oauth-service";
import type { LiveClass, ZoomMeetingRecord } from "@/types/classes";
import type { ZoomApiMeeting } from "@/types/zoom-oauth";

function meetingTopicAndAgenda(liveClass: LiveClass): { topic: string; agenda: string } {
  const course = liveClass.courseId ? getCourseById(liveClass.courseId) : null;
  return {
    topic: course?.title?.trim() || liveClass.title,
    agenda:
      course?.shortDescription?.trim() ||
      course?.fullDescription?.trim() ||
      liveClass.description ||
      liveClass.title,
  };
}

function fromApiMeeting(
  liveClass: LiveClass,
  json: ZoomApiMeeting,
  oauthUserId: string,
): Omit<ZoomMeetingRecord, "id" | "createdAt" | "updatedAt"> {
  const host = findUserById(oauthUserId);
  return {
    liveClassId: liveClass.id,
    zoomMeetingId: String(json.id),
    zoomUuid: json.uuid ?? null,
    joinUrl: json.join_url ?? "",
    startUrl: json.start_url ?? "",
    password: json.password ?? "",
    hostEmail: host?.email ?? json.host_id ?? null,
    waitingRoom: true,
    passcodeEnabled: Boolean(json.password),
    coHostEmails: [],
    providerMode: "zoom",
    hostId: json.host_id ?? null,
    timezone: json.timezone ?? liveClass.timezone,
    durationMinutes: json.duration ?? liveClass.durationMinutes,
    startTime: json.start_time ?? liveClass.startsAt,
    status: (json.status as ZoomMeetingRecord["status"]) ?? "scheduled",
    oauthUserId,
    participantCount: null,
    raw: json as unknown as Record<string, unknown>,
  };
}

function persistMeeting(
  liveClassId: string,
  payload: Omit<ZoomMeetingRecord, "id" | "createdAt" | "updatedAt">,
  existingId?: string,
): ZoomMeetingRecord {
  const now = new Date().toISOString();
  const record: ZoomMeetingRecord = {
    id: existingId ?? generateId(),
    ...payload,
    createdAt: now,
    updatedAt: now,
  };
  writeClassesDb((d) => {
    d.zoomMeetings = d.zoomMeetings.filter((z) => z.liveClassId !== liveClassId);
    d.zoomMeetings.push(record);
    const idx = d.classes.findIndex((c) => c.id === liveClassId);
    if (idx >= 0) {
      const current = d.classes[idx]!;
      d.classes[idx] = { ...current, zoomMeetingId: record.id, updatedAt: now };
    }
  });
  return record;
}

export async function createInstructorZoomMeeting(input: {
  liveClass: LiveClass;
  actorId?: string | null;
}): Promise<ZoomMeetingRecord | null> {
  const instructorId = input.liveClass.instructorId;
  const token = await getValidInstructorAccessToken(instructorId);
  if (!token) return null;

  const { topic, agenda } = meetingTopicAndAgenda(input.liveClass);
  const timezone = instructorTimezone(instructorId, input.liveClass.timezone);
  const json = await createZoomUserMeeting(
    token,
    instructorMeetingPayload({
      topic,
      agenda,
      startTime: input.liveClass.startsAt,
      durationMinutes: input.liveClass.durationMinutes,
      timezone,
    }),
    instructorId,
  );

  const record = persistMeeting(
    input.liveClass.id,
    fromApiMeeting(input.liveClass, json, instructorId),
  );
  emitZoomEvent({
    event: "zoom.meeting.created",
    userId: instructorId,
    message: "Zoom meeting created for live class",
    details: { liveClassId: input.liveClass.id, zoomMeetingId: record.zoomMeetingId },
    dispatchOutbound: true,
  });
  await logZoomActivity({
    actorId: input.actorId ?? instructorId,
    action: ZOOM_ACTIVITY.MEETING_CREATED,
    entityType: "zoom_meeting",
    entityId: record.id,
    metadata: {
      liveClassId: input.liveClass.id,
      zoomMeetingId: record.zoomMeetingId,
      via: "instructor_oauth",
    },
  });
  return record;
}

export async function updateInstructorZoomMeeting(input: {
  liveClass: LiveClass;
  existing: ZoomMeetingRecord;
  actorId?: string | null;
}): Promise<boolean> {
  const ownerId = input.existing.oauthUserId || input.liveClass.instructorId;
  const token = await getValidInstructorAccessToken(ownerId);
  if (!token) return false;

  const { topic, agenda } = meetingTopicAndAgenda(input.liveClass);
  const timezone = instructorTimezone(ownerId, input.liveClass.timezone);
  try {
    await updateZoomUserMeeting(
      token,
      input.existing.zoomMeetingId,
      instructorMeetingPayload({
        topic,
        agenda,
        startTime: input.liveClass.startsAt,
        durationMinutes: input.liveClass.durationMinutes,
        timezone,
      }),
      ownerId,
    );
  } catch (error) {
    if (error instanceof ZoomApiError && error.status === 404) {
      await createInstructorZoomMeeting({ liveClass: input.liveClass, actorId: input.actorId });
      return true;
    }
    throw error;
  }

  const now = new Date().toISOString();
  writeClassesDb((d) => {
    const idx = d.zoomMeetings.findIndex((z) => z.id === input.existing.id);
    if (idx < 0) return;
    const current = d.zoomMeetings[idx]!;
    d.zoomMeetings[idx] = {
      ...current,
      timezone,
      durationMinutes: input.liveClass.durationMinutes,
      startTime: input.liveClass.startsAt,
      updatedAt: now,
      raw: {
        ...current.raw,
        topic,
        agenda,
        start_time: input.liveClass.startsAt,
        duration: input.liveClass.durationMinutes,
      },
    };
  });

  emitZoomEvent({
    event: "zoom.meeting.updated",
    userId: ownerId,
    message: "Zoom meeting updated",
    details: { liveClassId: input.liveClass.id, zoomMeetingId: input.existing.zoomMeetingId },
    dispatchOutbound: true,
  });
  await logZoomActivity({
    actorId: input.actorId ?? ownerId,
    action: ZOOM_ACTIVITY.MEETING_UPDATED,
    entityType: "zoom_meeting",
    entityId: input.existing.id,
    metadata: { liveClassId: input.liveClass.id, via: "instructor_oauth" },
  });
  enqueueZoomNotification({
    kind: "updated",
    liveClassId: input.liveClass.id,
    classTitle: input.liveClass.title,
    startsAt: input.liveClass.startsAt,
    actorId: input.actorId,
  });
  return true;
}

export async function deleteInstructorZoomMeeting(input: {
  liveClassId: string;
  existing: ZoomMeetingRecord;
  classTitle?: string;
  actorId?: string | null;
  notify?: boolean;
}): Promise<boolean> {
  const ownerId = input.existing.oauthUserId;
  const token = ownerId ? await getValidInstructorAccessToken(ownerId) : null;
  if (token) {
    try {
      await deleteZoomUserMeeting(token, input.existing.zoomMeetingId, ownerId);
    } catch (error) {
      if (!(error instanceof ZoomApiError && (error.status === 404 || error.status === 400))) {
        throw error;
      }
    }
  } else {
    return false;
  }

  writeClassesDb((d) => {
    d.zoomMeetings = d.zoomMeetings.filter((z) => z.id !== input.existing.id);
    const idx = d.classes.findIndex((c) => c.id === input.liveClassId);
    if (idx >= 0) {
      const current = d.classes[idx]!;
      d.classes[idx] = { ...current, zoomMeetingId: null, updatedAt: new Date().toISOString() };
    }
  });

  emitZoomEvent({
    event: "zoom.meeting.deleted",
    userId: ownerId,
    message: "Zoom meeting deleted",
    details: { liveClassId: input.liveClassId, zoomMeetingId: input.existing.zoomMeetingId },
    dispatchOutbound: true,
  });
  await logZoomActivity({
    actorId: input.actorId ?? ownerId,
    action: ZOOM_ACTIVITY.MEETING_CANCELLED,
    entityType: "zoom_meeting",
    entityId: input.existing.id,
    metadata: { liveClassId: input.liveClassId, via: "instructor_oauth" },
  });
  if (input.notify !== false) {
    enqueueZoomNotification({
      kind: "cancelled",
      liveClassId: input.liveClassId,
      classTitle: input.classTitle || "Live class",
      actorId: input.actorId,
    });
  }
  return true;
}

export async function syncInstructorMeetings(userId: string): Promise<{
  profileSynced: boolean;
  meetingsSynced: number;
  errors: string[];
}> {
  const token = await getValidInstructorAccessToken(userId);
  const errors: string[] = [];
  if (!token) {
    return { profileSynced: false, meetingsSynced: 0, errors: ["Zoom is not connected"] };
  }

  const { getCachedZoomProfile } = await import("@/services/zoom/oauth-service");
  await getCachedZoomProfile(userId);

  const classes = readClassesDb().classes.filter(
    (c) => !c.deletedAt && c.instructorId === userId && c.status !== "cancelled",
  );
  let meetingsSynced = 0;

  for (const cls of classes) {
    const meeting = readClassesDb().zoomMeetings.find((z) => z.liveClassId === cls.id);
    if (!meeting || meeting.providerMode !== "zoom") continue;
    try {
      const remote = await getZoomUserMeeting(token, meeting.zoomMeetingId, userId);
      const participants = await getZoomMeetingParticipantCount(
        token,
        meeting.zoomMeetingId,
        userId,
      );
      const now = new Date().toISOString();
      writeClassesDb((d) => {
        const idx = d.zoomMeetings.findIndex((z) => z.id === meeting.id);
        if (idx < 0) return;
        const current = d.zoomMeetings[idx]!;
        d.zoomMeetings[idx] = {
          ...current,
          zoomUuid: remote.uuid ?? current.zoomUuid,
          joinUrl: remote.join_url ?? current.joinUrl,
          startUrl: remote.start_url ?? current.startUrl,
          password: remote.password ?? current.password,
          hostId: remote.host_id ?? current.hostId,
          timezone: remote.timezone ?? current.timezone,
          durationMinutes: remote.duration ?? current.durationMinutes,
          startTime: remote.start_time ?? current.startTime,
          status: (remote.status as ZoomMeetingRecord["status"]) ?? current.status,
          participantCount: participants,
          updatedAt: now,
          raw: { ...current.raw, ...(remote as unknown as Record<string, unknown>) },
        };
      });
      meetingsSynced += 1;
    } catch (error) {
      errors.push(
        `${meeting.zoomMeetingId}: ${error instanceof Error ? error.message : "sync failed"}`,
      );
    }
  }

  emitZoomEvent({
    event: "zoom.sync.completed",
    userId,
    message: "Instructor Zoom sync completed",
    details: { meetingsSynced, errorCount: errors.length },
  });
  await logZoomActivity({
    actorId: userId,
    action: ZOOM_ACTIVITY.SYNCED,
    entityId: userId,
    metadata: { meetingsSynced, errorCount: errors.length },
  });

  return { profileSynced: true, meetingsSynced, errors };
}

export function liveClassMeetingFieldsChanged(before: LiveClass, after: LiveClass): boolean {
  return (
    before.title !== after.title ||
    before.description !== after.description ||
    before.startsAt !== after.startsAt ||
    before.durationMinutes !== after.durationMinutes ||
    before.timezone !== after.timezone ||
    before.courseId !== after.courseId
  );
}
