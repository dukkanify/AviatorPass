/**
 * Reminder queue — email/in-app offsets configurable via platform settings.
 */

import { generateId } from "@/lib/security/crypto";
import { appJoinUrl } from "@/lib/site-origin";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { DEFAULT_REMINDER_OFFSETS_MINUTES } from "@/constants/classes";
import { logActivity } from "@/services/auth/activity-log";
import { findUserById } from "@/services/auth/store";
import { sendEmail } from "@/services/email/mailer";
import { createNotification } from "@/services/notifications/notification-service";
import { classReminderEmailTemplate } from "@/services/settings/email-templates";
import { getPlatformSettings } from "@/services/settings/settings-service";
import {
  cancelPendingForClass,
  listAllReminders,
  listDueReminders,
  listRemindersForClass,
  replacePendingForClass,
  upsertReminder,
} from "@/lib/data/lms-class-reminder-store";
import { listParticipantsForClass, readClassesDb } from "@/services/classes/store";
import type { ReminderKind, ReminderQueueItem } from "@/types/classes";

export async function queueClassReminders(liveClassId: string): Promise<ReminderQueueItem[]> {
  const cls = readClassesDb().classes.find((c) => c.id === liveClassId && !c.deletedAt);
  if (!cls || cls.status === "cancelled" || cls.status === "draft") return [];

  const settings = getPlatformSettings();
  const offsets = [...(settings.notifications.classReminderOffsetsMinutes ?? [1440, 120])];
  if (settings.notifications.classReminderFifteenMinutesEnabled) {
    if (!offsets.includes(DEFAULT_REMINDER_OFFSETS_MINUTES["15m"])) {
      offsets.push(DEFAULT_REMINDER_OFFSETS_MINUTES["15m"]);
    }
  }

  const participants = listParticipantsForClass(liveClassId);
  const start = Date.parse(cls.startsAt);
  const now = Date.now();
  const created: ReminderQueueItem[] = [];
  const ts = new Date().toISOString();

  const nextPending: ReminderQueueItem[] = [];
  for (const p of participants) {
    for (const minutes of offsets) {
      let kind: ReminderKind = "2h";
      if (minutes >= 1440) kind = "24h";
      else if (minutes >= 120) kind = "2h";
      else kind = "15m";

      const scheduledFor = new Date(start - minutes * 60_000).toISOString();
      if (Date.parse(scheduledFor) < now - 60_000) continue;

      const channels: Array<"email" | "in_app"> = ["in_app"];
      if (settings.notifications.reminderEmails && settings.notifications.emailNotifications) {
        channels.push("email");
      }

      for (const channel of channels) {
        const item: ReminderQueueItem = {
          id: generateId(),
          liveClassId,
          userId: p.userId,
          kind,
          channel,
          scheduledFor,
          sentAt: null,
          status: "pending",
          payload: { title: cls.title, startsAt: cls.startsAt },
          createdAt: ts,
        };
        nextPending.push(item);
        created.push(item);
      }
    }

    const liveItem: ReminderQueueItem = {
      id: generateId(),
      liveClassId,
      userId: p.userId,
      kind: "live_now",
      channel: "in_app",
      scheduledFor: cls.startsAt,
      sentAt: null,
      status: "pending",
      payload: { title: cls.title, startsAt: cls.startsAt },
      createdAt: ts,
    };
    if (Date.parse(liveItem.scheduledFor) >= now - 60_000) {
      nextPending.push(liveItem);
      created.push(liveItem);
    }

    const finishedItem: ReminderQueueItem = {
      id: generateId(),
      liveClassId,
      userId: p.userId,
      kind: "finished",
      channel: "in_app",
      scheduledFor: cls.endsAt,
      sentAt: null,
      status: "pending",
      payload: { title: cls.title, startsAt: cls.startsAt },
      createdAt: ts,
    };
    if (Date.parse(finishedItem.scheduledFor) >= now - 60_000) {
      nextPending.push(finishedItem);
      created.push(finishedItem);
    }
  }
  replacePendingForClass(liveClassId, nextPending);

  await logActivity({
    actorId: null,
    action: ACTIVITY_ACTIONS.REMINDER_QUEUED,
    entityType: "live_class",
    entityId: liveClassId,
    metadata: { count: created.length },
  });

  return created;
}

export async function cancelClassReminders(liveClassId: string): Promise<void> {
  cancelPendingForClass(liveClassId);
}

/** Process due reminders (call from cron/API). */
export async function processDueReminders(nowIso = new Date().toISOString()): Promise<number> {
  const due = listDueReminders(nowIso);
  let sent = 0;

  for (const item of due) {
    const cls = readClassesDb().classes.find((c) => c.id === item.liveClassId);
    if (!cls || cls.status === "cancelled") {
      upsertReminder({ ...item, status: "cancelled" });
      continue;
    }

    const label =
      item.kind === "finished"
        ? "Class has finished"
        : item.kind === "live_now"
          ? "Class is live now"
          : item.kind === "15m"
            ? "Class starts in 15 minutes"
            : item.kind === "2h"
              ? "Class starts in 2 hours"
              : "Class starts in 24 hours";

    const notificationType =
      item.kind === "finished"
        ? "zoom.meeting.finished"
        : item.kind === "15m" || item.kind === "2h"
          ? "zoom.meeting.starts_soon"
          : `class.reminder.${item.kind}`;

    if (item.channel === "email") {
      const user = findUserById(item.userId);
      if (!user?.email) {
        upsertReminder({ ...item, status: "cancelled" });
        continue;
      }
      const template = classReminderEmailTemplate({
        title: cls.title,
        startsAt: cls.startsAt,
        label,
        joinUrl: cls.zoomMeetingId ? appJoinUrl(cls.id, cls.zoomMeetingId) : undefined,
      });
      const mail = await sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        meta: { kind: "class_reminder", liveClassId: cls.id, reminderId: item.id },
      });
      if (!mail.success) {
        upsertReminder({
          ...item,
          status: "pending",
          payload: { ...item.payload, lastError: mail.error },
        });
        continue;
      }
    } else {
      await createNotification({
        userId: item.userId,
        title: label,
        body: `${cls.title} · ${new Date(cls.startsAt).toLocaleString()}`,
        type: notificationType,
        channel: "in_app",
        data: { liveClassId: cls.id, kind: item.kind },
      });
    }

    upsertReminder({
      ...item,
      status: "sent",
      sentAt: new Date().toISOString(),
    });

    await logActivity({
      actorId: null,
      action: ACTIVITY_ACTIONS.REMINDER_SENT,
      entityType: "reminder",
      entityId: item.id,
      metadata: { liveClassId: item.liveClassId, kind: item.kind, channel: item.channel },
    });
    sent += 1;
  }

  return sent;
}

export function listReminders(options?: { liveClassId?: string; status?: string }) {
  let rows = options?.liveClassId ? listRemindersForClass(options.liveClassId) : listAllReminders();
  if (options?.status) rows = rows.filter((row) => row.status === options.status);
  return [...rows].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}
