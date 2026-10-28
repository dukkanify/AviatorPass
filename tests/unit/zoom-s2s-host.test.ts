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

  it("creates live-class meetings on the platform S2S host when personal OAuth is absent", async () => {
    process.env.ZOOM_ACCOUNT_ID = "acct_test";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_test";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_test";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.ALLOW_ZOOM_MOCK;

    previousHost = getPlatformSettings().zoom.accountEmail;
    await updatePlatformSettings({
      patch: { zoom: { enabled: true, accountEmail: "ceo@aviatorpass.com" } },
      actorId: "test-actor",
    });

    const posts: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "s2s-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/users?") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(
          JSON.stringify({ users: [{ id: "ceo-user", email: "ceo@aviatorpass.com", type: 2 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/settings") && (!init || !init.method || init.method === "GET" || init.method === "PATCH")) {
        return new Response(JSON.stringify({ in_meeting: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/meetings") && init?.method === "POST") {
        posts.push(url);
        return new Response(
          JSON.stringify({
            id: 82122854801,
            uuid: "uuid-s2s",
            join_url: "https://zoom.us/j/82122854801",
            start_url: "https://zoom.us/s/82122854801?zak=platform-zak-token",
            password: "pass123",
            host_email: "ceo@aviatorpass.com",
            host_id: "ceo-user",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const meeting = await createMeetingForClass({
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
    });
    expect(meeting.zoomMeetingId).toBe("82122854801");
    expect(meeting.hostEmail).toBe("ceo@aviatorpass.com");
    expect(meeting.oauthUserId).toBeNull();
    expect(meeting.startUrl).toContain("zak=");
    expect(posts.some((url) => url.includes("/users/"))).toBe(true);
  });
});
