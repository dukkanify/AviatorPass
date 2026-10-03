import { afterEach, describe, expect, it } from "vitest";

import { ensureClassesSeeded } from "@/services/classes/seed";
import { readClassesDb, writeClassesDb } from "@/services/classes/store";
import {
  ensureLiveMeetingForClass,
  isLiveZoomConfigured,
  isMockZoomAllowed,
  isPlaceholderZoomMeeting,
  resetZoomS2STokenCacheForTests,
} from "@/services/classes/zoom-service";
import { ensurePlatformDemoEnvironment } from "@/services/demo/platform-demo-seed";
import { readBookingsDb, writeBookingsDb } from "@/services/bookings/store";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function setLiveZoomEnv() {
  process.env.ZOOM_ACCOUNT_ID = "acct_live";
  process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_live";
  process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_live";
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  resetZoomS2STokenCacheForTests();
});

describe("live Zoom everywhere", () => {
  it("treats mock meetings and mock ZAKs as placeholders", () => {
    expect(isPlaceholderZoomMeeting(null)).toBe(true);
    expect(isPlaceholderZoomMeeting({ providerMode: "mock" })).toBe(true);
    expect(
      isPlaceholderZoomMeeting({
        providerMode: "zoom",
        startUrl: "https://zoom.us/s/1?zak=mock",
      }),
    ).toBe(true);
    expect(
      isPlaceholderZoomMeeting({
        providerMode: "zoom",
        joinUrl: "https://zoom.us/j/1",
        startUrl: "https://zoom.us/s/1?zak=real-token",
      }),
    ).toBe(false);
  });

  it("forbids mock meetings whenever Server-to-Server Zoom is configured", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    delete process.env.VERCEL_ENV;
    process.env.ALLOW_ZOOM_MOCK = "true";
    setLiveZoomEnv();
    expect(isLiveZoomConfigured()).toBe(true);
    expect(isMockZoomAllowed()).toBe(false);
  });

  it("replaces a seeded mock class meeting with a live Zoom meeting", async () => {
    setLiveZoomEnv();
    const classId = "cls_upgrade_live";
    const now = new Date().toISOString();
    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== classId);
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== classId);
      db.classes.push({
        id: classId,
        title: "Upgrade mock class",
        description: "",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor_missing",
        assistantInstructorId: null,
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 120 * 60_000).toISOString(),
        durationMinutes: 60,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: "zm_mock_upgrade",
        recurringRuleId: null,
        parentClassId: null,
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
        createdById: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      db.zoomMeetings.push({
        id: "zm_mock_upgrade",
        liveClassId: classId,
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
        createdAt: now,
        updatedAt: now,
      });
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "live-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
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
            host_email: "ceo@aviatorpass.com",
            host_id: "zoom-host",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const meeting = await ensureLiveMeetingForClass(classId, "actor_live");
    expect(meeting?.providerMode).toBe("zoom");
    expect(meeting?.zoomMeetingId).toBe("86524929538");
    expect(meeting?.startUrl).toContain("zak=live-zak");
    expect(isPlaceholderZoomMeeting(meeting)).toBe(false);

    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== classId);
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== classId);
    });
  });

  it("seeds classes without mock Zoom when live Zoom is configured", () => {
    setLiveZoomEnv();
    const snapshot = structuredClone(readClassesDb());
    try {
      writeClassesDb((db) => {
        db.classes = [];
        db.zoomMeetings = [];
        db.participants = [];
        db.attendance = [];
        db.recordings = [];
        db.reminders = [];
        db.recurringRules = [];
        db.seeded = false;
      });
      ensureClassesSeeded();
      const seeded = readClassesDb();
      expect(seeded.classes.length).toBeGreaterThan(0);
      expect(seeded.zoomMeetings).toEqual([]);
      expect(
        seeded.classes.every((item) => item.zoomMeetingId == null || item.status === "cancelled"),
      ).toBe(true);
    } finally {
      writeClassesDb((db) => {
        Object.assign(db, snapshot);
      });
    }
  });

  it("clears already-seeded mock meetings when live Zoom is configured", () => {
    setLiveZoomEnv();
    const snapshot = structuredClone(readClassesDb());
    const now = new Date().toISOString();
    try {
      writeClassesDb((db) => {
        db.seeded = true;
        db.classes = [
          {
            id: "cls_seeded_mock",
            title: "Already seeded mock",
            description: "",
            courseId: null,
            moduleId: null,
            lessonId: null,
            instructorId: "instructor_missing",
            assistantInstructorId: null,
            startsAt: now,
            endsAt: now,
            durationMinutes: 60,
            timezone: "Asia/Kuwait",
            maxStudents: 10,
            meetingType: "meeting",
            status: "scheduled",
            zoomMeetingId: "zm_old_mock",
            recurringRuleId: null,
            parentClassId: null,
            cancelledAt: null,
            cancelReason: null,
            rescheduledFromId: null,
            createdById: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ];
        db.zoomMeetings = [
          {
            id: "zm_old_mock",
            liveClassId: "cls_seeded_mock",
            zoomMeetingId: "900100200",
            zoomUuid: "uuid",
            joinUrl: "https://zoom.us/j/900100200",
            startUrl: "https://zoom.us/s/900100200",
            password: "demo",
            hostEmail: null,
            waitingRoom: true,
            passcodeEnabled: true,
            coHostEmails: [],
            providerMode: "mock",
            raw: { seeded: true },
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
      ensureClassesSeeded();
      const next = readClassesDb();
      expect(next.zoomMeetings).toEqual([]);
      expect(next.classes[0]?.zoomMeetingId).toBeNull();
    } finally {
      writeClassesDb((db) => {
        Object.assign(db, snapshot);
      });
    }
  });

  it("does not seed a mock booking Zoom session when live Zoom is configured", () => {
    setLiveZoomEnv();
    const bookingsSnapshot = structuredClone(readBookingsDb());
    const classesSnapshot = structuredClone(readClassesDb());
    try {
      writeBookingsDb((db) => {
        db.bookings = [];
        db.seeded = false;
      });
      ensurePlatformDemoEnvironment();
      const bookings = readBookingsDb().bookings.filter((item) =>
        item.notes?.includes("Permanent demo"),
      );
      expect(bookings.length).toBeGreaterThan(0);
      expect(bookings.every((item) => item.zoom == null || item.zoom.providerMode === "zoom")).toBe(
        true,
      );
    } finally {
      writeBookingsDb((db) => {
        Object.assign(db, bookingsSnapshot);
      });
      writeClassesDb((db) => {
        Object.assign(db, classesSnapshot);
      });
    }
  });
});
