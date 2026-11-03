import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb, writeAuthDb } from "@/services/auth/store";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { writeClassesDb } from "@/services/classes/store";
import { processEmailQueue } from "@/services/email/queue";
import { listReminders } from "@/services/classes/reminder-service";
import { resetEmailSuppressionStoreForTests } from "@/services/email/suppression-store";

const ORIGINAL_ENV = { ...process.env };

function student() {
  return readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active")!;
}

describe("email cron processes class reminders", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    ensureDemoUsersSeeded();
    writeClassesDb((db) => {
      db.classes = [];
      db.zoomMeetings = [];
      db.recurringRules = [];
      db.attendance = [];
      db.participants = [];
      db.recordings = [];
      db.reminders = [];
      db.seeded = false;
    });
    ensureClassesSeeded();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sends due class reminder rows when the email cron runs", async () => {
    resetEmailSuppressionStoreForTests();
    const user = student();
    const originalEmail = user.email;
    // Demo catalog inboxes are suppressed; use a deliverable QA address for the cron path.
    writeAuthDb((db) => {
      const row = db.users.find((u) => u.id === user.id);
      if (row) row.email = "qa.cron.reminder@example.com";
    });
    const now = new Date();
    const startsAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const classId = "cls_reminder_cron";
    writeClassesDb((db) => {
      db.classes.push({
        id: classId,
        title: "Reminder cron class",
        description: "",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor_1",
        assistantInstructorId: null,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
        durationMinutes: 30,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: null,
        recurringRuleId: null,
        parentClassId: null,
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
        createdById: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        deletedAt: null,
      });
      db.reminders.push({
        id: "rem_due_email",
        liveClassId: classId,
        userId: user.id,
        kind: "1h",
        channel: "email",
        scheduledFor: new Date(now.getTime() - 60_000).toISOString(),
        sentAt: null,
        status: "pending",
        payload: { title: "Reminder cron class", startsAt },
        createdAt: now.toISOString(),
      });
    });

    const cron = await processEmailQueue(10);
    expect(cron.classReminders).toBeGreaterThan(0);
    expect(listReminders({ liveClassId: classId }).every((row) => row.status !== "pending")).toBe(
      true,
    );
    writeAuthDb((db) => {
      const row = db.users.find((u) => u.id === user.id);
      if (row) row.email = originalEmail;
    });
  });
});
