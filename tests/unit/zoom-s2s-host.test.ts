import { afterEach, describe, expect, it } from "vitest";

import {
  PROJECT_CONTACT_EMAIL,
  PROJECT_SUPPORT_EMAIL,
} from "@/lib/branding/legacy-client-identity";
import { writeClassesDb } from "@/services/classes/store";
import {
  createMeetingForClass,
  isZoomMissingUserError,
  resolveZoomS2SUser,
} from "@/services/classes/zoom-service";
import { getPlatformSettings, updatePlatformSettings } from "@/services/settings/settings-service";

describe("Zoom S2S host user", () => {
  it("uses me when the host field is the support or contact mailbox", () => {
    expect(resolveZoomS2SUser(PROJECT_SUPPORT_EMAIL)).toBe("me");
    expect(resolveZoomS2SUser(` ${PROJECT_SUPPORT_EMAIL.toUpperCase()} `)).toBe("me");
    expect(resolveZoomS2SUser(PROJECT_CONTACT_EMAIL)).toBe("me");
    expect(resolveZoomS2SUser("")).toBe("me");
    expect(resolveZoomS2SUser(null)).toBe("me");
  });

  it("keeps a real Zoom account mailbox", () => {
    expect(resolveZoomS2SUser("ceo@aviatorpass.com")).toBe("ceo@aviatorpass.com");
  });

  it("detects Zoom missing-user errors", () => {
    expect(
      isZoomMissingUserError(
        JSON.stringify({ code: 1001, message: "User does not exist: support@aviatorpass.com." }),
      ),
    ).toBe(true);
    expect(isZoomMissingUserError(JSON.stringify({ code: 4711, message: "scopes" }))).toBe(false);
    expect(isZoomMissingUserError("User does not exist: support@aviatorpass.com.")).toBe(true);
  });
});

describe("Zoom S2S meeting create host fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let previousHost = "";

  afterEach(async () => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== "cls_s2s_host");
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== "cls_s2s_host");
    });
    if (previousHost && getPlatformSettings().zoom.accountEmail !== previousHost) {
      await updatePlatformSettings({
        patch: { zoom: { accountEmail: previousHost } },
        actorId: "test-actor",
      });
    }
  });

  it("does not create live-class meetings on the shared platform S2S host", async () => {
    process.env.ZOOM_ACCOUNT_ID = "acct_test";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_test";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_test";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.ALLOW_ZOOM_MOCK;

    previousHost = getPlatformSettings().zoom.accountEmail;
    await updatePlatformSettings({
      patch: { zoom: { enabled: true, accountEmail: PROJECT_SUPPORT_EMAIL } },
      actorId: "test-actor",
    });
    expect(getPlatformSettings().zoom.accountEmail).toBe(PROJECT_SUPPORT_EMAIL);

    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await expect(
      createMeetingForClass({
        liveClass: {
          id: "cls_s2s_host",
          title: "S2S host fallback",
          description: "",
          courseId: null,
          moduleId: null,
          lessonId: null,
          instructorId: "instructor_missing",
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
      }),
    ).rejects.toThrow(/connect your Zoom account/i);
  });
});
