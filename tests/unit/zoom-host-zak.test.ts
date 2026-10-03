import { afterEach, describe, expect, it } from "vitest";

import { generateMeetingSdkSignature } from "@/lib/zoom/meeting-sdk";
import { writeClassesDb } from "@/services/classes/store";
import {
  fetchZoomHostZak,
  probeZoomHostZak,
  resetZoomS2STokenCacheForTests,
  resolveZoomHostZak,
  updateMeetingForClass,
} from "@/services/classes/zoom-service";
import type { LiveClass } from "@/types/classes";

describe("Zoom host ZAK for in-app Meeting SDK", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    resetZoomS2STokenCacheForTests();
    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== "cls-host-1");
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.zoomMeetingId !== "82122854800");
    });
  });

  function s2sEnv() {
    process.env.ZOOM_ACCOUNT_ID = "acct_1";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_1";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_1";
  }

  function storedMeeting(startUrl: string) {
    writeClassesDb((db) => {
      db.zoomMeetings.push({
        id: "zm-host-1",
        liveClassId: "cls-host-1",
        zoomMeetingId: "82122854800",
        zoomUuid: "uuid-1",
        joinUrl: "https://us02web.zoom.us/j/82122854800",
        startUrl,
        password: "123456",
        hostEmail: "ceo@aviatorpass.com",
        waitingRoom: false,
        passcodeEnabled: true,
        coHostEmails: [],
        providerMode: "zoom",
        hostId: "zoom-host-99",
        oauthUserId: null,
        raw: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  it("uses the stored create start_url ZAK without calling Zoom token APIs", async () => {
    s2sEnv();
    storedMeeting("https://us02web.zoom.us/s/82122854800?zak=stored-create-zak");

    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("should not be called", { status: 500 });
    }) as typeof fetch;

    const resolved = await resolveZoomHostZak({
      meetingNumber: "82122854800",
      instructorUserId: "instructor-app-user",
    });
    expect(resolved.zak).toBe("stored-create-zak");
    expect(resolved.ready).toBe(true);
    expect(resolved.source).toBe("meeting-start-url");
    expect(resolved.hostUser).toBe("ceo@aviatorpass.com");
    expect(resolved.hasZakScope).toBe(false);
    expect(resolved.usedInstructorOAuth).toBe(false);
    expect(calls).toEqual([]);

    const zak = await fetchZoomHostZak({
      meetingNumber: "82122854800",
      instructorUserId: "instructor-app-user",
    });
    const role: 0 | 1 = zak ? 1 : 0;
    const signature = generateMeetingSdkSignature({
      clientId: "general-app-client",
      clientSecret: "general-app-secret",
      meetingNumber: "82122854800",
      role,
      nowSec: 1_700_000_030,
    });
    const payload = JSON.parse(
      Buffer.from(signature.split(".")[1]!, "base64url").toString("utf8"),
    ) as { role: number; mn: string };
    expect(zak).toBe("stored-create-zak");
    expect(payload.role).toBe(1);
    expect(payload.mn).toBe("82122854800");
  });

  it("keeps students on participant role 0 without a ZAK", async () => {
    storedMeeting("https://us02web.zoom.us/s/82122854800?zak=stored-create-zak");
    const studentRole: 0 | 1 = 0;
    const signature = generateMeetingSdkSignature({
      clientId: "general-app-client",
      clientSecret: "general-app-secret",
      meetingNumber: "82122854800",
      role: studentRole,
      nowSec: 1_700_000_030,
    });
    const payload = JSON.parse(
      Buffer.from(signature.split(".")[1]!, "base64url").toString("utf8"),
    ) as { role: number };
    expect(payload.role).toBe(0);
  });

  it("does not treat missing user:read:zak scopes as a production blocker", async () => {
    s2sEnv();
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("should not be called", { status: 500 });
    }) as typeof fetch;

    const probe = await probeZoomHostZak({ accountEmail: "ceo@aviatorpass.com" });
    expect(probe.ready).toBe(true);
    expect(probe.source).toBe("meeting-start-url");
    expect(probe.error).toBeNull();
    expect(probe.hasZakScope).toBe(false);
    expect(probe.hostUser).toBe("ceo@aviatorpass.com");
    expect(calls).toEqual([]);
  });

  it("returns no ZAK when the stored start_url has none", async () => {
    storedMeeting("https://us02web.zoom.us/s/82122854800");
    const resolved = await resolveZoomHostZak({ meetingNumber: "82122854800" });
    expect(resolved.zak).toBeNull();
    expect(resolved.ready).toBe(false);
    expect(resolved.source).toBe("meeting-start-url");
    expect(resolved.error).toMatch(/start_url has no host ZAK/i);
  });

  it("returns null when no meeting start_url is stored", async () => {
    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    await expect(fetchZoomHostZak()).resolves.toBeNull();
    await expect(fetchZoomHostZak({ meetingNumber: "82122854800" })).resolves.toBeNull();
  });

  it("refreshes the stored start_url only when a meeting is updated", async () => {
    s2sEnv();
    storedMeeting("https://us02web.zoom.us/s/82122854800?zak=stored-create-zak");
    writeClassesDb((db) => {
      db.classes.push({
        id: "cls-host-1",
        title: "ATPL Air Law",
        description: "Update me",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor-app-user",
        assistantInstructorId: null,
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
        durationMinutes: 30,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: "zm-host-1",
        recurringRuleId: null,
        parentClassId: null,
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
        createdById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } satisfies LiveClass);
    });

    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      calls.push(`${method} ${url}`);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "s2s-token",
            expires_in: 3600,
            scope: "meeting:write:meeting:admin",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/meetings/82122854800") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/meetings/82122854800")) {
        return new Response(
          JSON.stringify({
            id: 82122854800,
            start_url: "https://us02web.zoom.us/s/82122854800?zak=updated-start-zak",
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const liveClass = writeClassesDb((db) => db).classes.find((item) => item.id === "cls-host-1")!;
    const updated = await updateMeetingForClass({
      liveClass: { ...liveClass, title: "ATPL Air Law updated", durationMinutes: 45 },
    });
    expect(updated?.startUrl).toBe("https://us02web.zoom.us/s/82122854800?zak=updated-start-zak");

    const resolved = await resolveZoomHostZak({ meetingNumber: "82122854800" });
    expect(resolved.zak).toBe("updated-start-zak");
    expect(resolved.source).toBe("meeting-start-url");
    expect(calls.some((url) => url.includes("/users/") && url.includes("/token"))).toBe(false);
    expect(calls.some((url) => url.startsWith("PATCH "))).toBe(true);
    expect(
      calls.some((url) => url.startsWith("GET ") && url.includes("/meetings/82122854800")),
    ).toBe(true);
  });

  it("keeps the create start_url when an update cannot read the meeting", async () => {
    s2sEnv();
    storedMeeting("https://us02web.zoom.us/s/82122854800?zak=stored-create-zak");
    writeClassesDb((db) => {
      db.classes.push({
        id: "cls-host-1",
        title: "ATPL Air Law",
        description: "",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor-app-user",
        assistantInstructorId: null,
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
        durationMinutes: 30,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: "zm-host-1",
        recurringRuleId: null,
        parentClassId: null,
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
        createdById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } satisfies LiveClass);
    });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "s2s-token",
            expires_in: 3600,
            scope: "meeting:write:meeting:admin",
          }),
          { status: 200 },
        );
      }
      if (method === "PATCH") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({
          code: 4711,
          message: "Invalid access token, does not contain scopes:[meeting:read:meeting:admin].",
        }),
        { status: 400 },
      );
    }) as typeof fetch;

    const liveClass = writeClassesDb((db) => db).classes.find((item) => item.id === "cls-host-1")!;
    const updated = await updateMeetingForClass({ liveClass });
    expect(updated?.startUrl).toBe("https://us02web.zoom.us/s/82122854800?zak=stored-create-zak");
    await expect(fetchZoomHostZak({ meetingNumber: "82122854800" })).resolves.toBe(
      "stored-create-zak",
    );
  });
});
