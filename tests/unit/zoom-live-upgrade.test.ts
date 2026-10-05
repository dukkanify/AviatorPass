import { afterEach, describe, expect, it } from "vitest";

import { writeClassesDb } from "@/services/classes/store";
import {
  isPlaceholderZoomMeeting,
  resetZoomS2STokenCacheForTests,
} from "@/services/classes/zoom-service";
import { upgradeUpcomingPlaceholderMeetings } from "@/services/zoom/live-upgrade";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  resetZoomS2STokenCacheForTests();
  writeClassesDb((db) => {
    db.classes = db.classes.filter((item) => item.id !== "cls_upgrade_soon");
    db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== "cls_upgrade_soon");
  });
});

describe("upcoming Zoom placeholder upgrade", () => {
  it("does nothing when live Zoom is not configured", async () => {
    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
    const result = await upgradeUpcomingPlaceholderMeetings({ limit: 2 });
    expect(result).toEqual({ upgraded: 0, failed: 0 });
  });

  it("replaces an upcoming mock class meeting with a live Zoom meeting", async () => {
    process.env.ZOOM_ACCOUNT_ID = "acct_live";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_live";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_live";
    const now = new Date();
    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== "cls_upgrade_soon");
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== "cls_upgrade_soon");
      db.classes.push({
        id: "cls_upgrade_soon",
        title: "Upcoming mock class",
        description: "",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor_missing",
        assistantInstructorId: null,
        startsAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
        endsAt: new Date(now.getTime() + 120 * 60_000).toISOString(),
        durationMinutes: 60,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: "zm_soon_mock",
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
      db.zoomMeetings.push({
        id: "zm_soon_mock",
        liveClassId: "cls_upgrade_soon",
        zoomMeetingId: "111222333",
        zoomUuid: "uuid-mock",
        joinUrl: "https://zoom.us/j/111222333",
        startUrl: "https://zoom.us/s/111222333?zak=mock",
        password: "mock",
        hostEmail: null,
        waitingRoom: true,
        passcodeEnabled: true,
        coHostEmails: [],
        providerMode: "mock",
        raw: { seeded: true },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "live-token", expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.includes("/meetings")) {
        return new Response(
          JSON.stringify({
            id: 86524929538,
            uuid: "uuid-live",
            join_url: "https://us02web.zoom.us/j/86524929538",
            start_url: "https://us02web.zoom.us/s/86524929538?zak=live-zak",
            password: "LivePass1",
          }),
          { status: 201 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await upgradeUpcomingPlaceholderMeetings({ limit: 4 });
    expect(result.upgraded).toBeGreaterThanOrEqual(1);
    const meeting = (await import("@/services/classes/store"))
      .readClassesDb()
      .zoomMeetings.find((item) => item.liveClassId === "cls_upgrade_soon");
    expect(meeting?.providerMode).toBe("zoom");
    expect(isPlaceholderZoomMeeting(meeting)).toBe(false);
  });
});
