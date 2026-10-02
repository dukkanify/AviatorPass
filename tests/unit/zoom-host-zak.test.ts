import { afterEach, describe, expect, it } from "vitest";

import { writeClassesDb } from "@/services/classes/store";
import {
  fetchZoomHostZak,
  resetZoomS2STokenCacheForTests,
  resolveZoomHostZak,
} from "@/services/classes/zoom-service";

describe("Zoom host ZAK for in-app Meeting SDK", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    resetZoomS2STokenCacheForTests();
    writeClassesDb((db) => {
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.zoomMeetingId !== "82122854800");
    });
  });

  function s2sEnv() {
    process.env.ZOOM_ACCOUNT_ID = "acct_1";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_1";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_1";
  }

  it("fetches ZAK for the Zoom meeting host, not /users/me/token", async () => {
    s2sEnv();
    writeClassesDb((db) => {
      db.zoomMeetings.push({
        id: "zm-host-1",
        liveClassId: "cls-host-1",
        zoomMeetingId: "82122854800",
        zoomUuid: "uuid-1",
        joinUrl: "https://us02web.zoom.us/j/82122854800",
        startUrl: "https://us02web.zoom.us/s/82122854800?zak=stored-create-zak",
        password: "123456",
        hostEmail: null,
        waitingRoom: false,
        passcodeEnabled: true,
        coHostEmails: [],
        providerMode: "zoom",
        hostId: null,
        oauthUserId: null,
        raw: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "s2s-token",
            expires_in: 3600,
            scope: "meeting:write:admin user:read:admin",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/meetings/82122854800")) {
        return new Response(
          JSON.stringify({ host_id: "zoom-host-99", host_email: "ceo@aviatorpass.com" }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me") && !url.includes("/token") && !url.includes("/zak")) {
        return new Response(JSON.stringify({ id: "zoom-owner-1", email: "ceo@aviatorpass.com" }), {
          status: 200,
        });
      }
      if (url.includes("/users/zoom-host-99/token?type=zak")) {
        return new Response(JSON.stringify({ token: "meeting-host-zak" }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 4700, message: "missing scopes" }), {
        status: 400,
      });
    }) as typeof fetch;

    const resolved = await resolveZoomHostZak({
      meetingNumber: "82122854800",
      instructorUserId: "instructor-app-user",
    });
    expect(resolved.zak).toBe("meeting-host-zak");
    expect(resolved.ready).toBe(true);
    expect(resolved.hostUser).toBe("zoom-host-99");
    expect(resolved.usedInstructorOAuth).toBe(false);
    expect(calls.some((url) => url.includes("/users/me/token?type=zak"))).toBe(false);
    expect(calls.some((url) => url.includes("/users/zoom-host-99/token?type=zak"))).toBe(true);
  });

  it("falls back to the S2S owner user id when no meeting host is stored", async () => {
    s2sEnv();
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({ access_token: "s2s-token", expires_in: 3600, scope: "user:read:admin" }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me") && !url.includes("/token") && !url.includes("/zak")) {
        return new Response(JSON.stringify({ id: "owner-id", email: "ceo@aviatorpass.com" }), {
          status: 200,
        });
      }
      if (url.includes("/users/owner-id/token?type=zak")) {
        return new Response(JSON.stringify({ token: "owner-zak-token" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    await expect(fetchZoomHostZak()).resolves.toBe("owner-zak-token");
    expect(calls.some((url) => url.includes("/users/owner-id/token?type=zak"))).toBe(true);
  });

  it("uses a fresh meeting start_url ZAK when the token API lacks ZAK scopes", async () => {
    s2sEnv();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
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
      if (url.includes("/meetings/82122854800")) {
        return new Response(
          JSON.stringify({
            host_id: "zoom-host-99",
            host_email: "ceo@aviatorpass.com",
            start_url: "https://us02web.zoom.us/s/82122854800?zak=fresh-start-zak",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me") && !url.includes("/token") && !url.includes("/zak")) {
        return new Response(JSON.stringify({ id: "owner-id", email: "ceo@aviatorpass.com" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          code: 4711,
          message:
            "Invalid access token, does not contain scopes:[user:read:zak, user:read:zak:admin].",
        }),
        { status: 400 },
      );
    }) as typeof fetch;

    const resolved = await resolveZoomHostZak({ meetingNumber: "82122854800" });
    expect(resolved.zak).toBe("fresh-start-zak");
    expect(resolved.ready).toBe(true);
    expect(resolved.hostUser).toBe("zoom-host-99");
  });

  it("uses the stored create start_url ZAK when GET /meetings is out of scope", async () => {
    s2sEnv();
    writeClassesDb((db) => {
      db.zoomMeetings.push({
        id: "zm-host-2",
        liveClassId: "cls-host-2",
        zoomMeetingId: "82122854800",
        zoomUuid: "uuid-2",
        joinUrl: "https://us02web.zoom.us/j/82122854800",
        startUrl: "https://us02web.zoom.us/s/82122854800?zak=stored-create-zak",
        password: "123456",
        hostEmail: "ceo@aviatorpass.com",
        waitingRoom: false,
        passcodeEnabled: true,
        coHostEmails: [],
        providerMode: "zoom",
        hostId: null,
        oauthUserId: null,
        raw: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
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
      return new Response(
        JSON.stringify({
          code: 4711,
          message: "Invalid access token, does not contain scopes:[meeting:read:meeting:admin].",
        }),
        { status: 400 },
      );
    }) as typeof fetch;

    const resolved = await resolveZoomHostZak({ meetingNumber: "82122854800" });
    expect(resolved.zak).toBe("stored-create-zak");
    expect(resolved.ready).toBe(true);
  });

  it("returns null when Zoom is not configured", async () => {
    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    await expect(fetchZoomHostZak()).resolves.toBeNull();
  });

  it("surfaces a missing-scope error when Zoom rejects every ZAK candidate", async () => {
    s2sEnv();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "s2s-token",
            expires_in: 3600,
            scope: "meeting:write:admin",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/users/me") && !url.includes("/token") && !url.includes("/zak")) {
        return new Response(JSON.stringify({ id: "owner-id", email: "ceo@aviatorpass.com" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          code: 4700,
          message: "Invalid access token, does not contain scopes: [user:read:admin]",
        }),
        { status: 400 },
      );
    }) as typeof fetch;

    const resolved = await resolveZoomHostZak();
    expect(resolved.zak).toBeNull();
    expect(resolved.ready).toBe(false);
    expect(resolved.hasZakScope).toBe(false);
    expect(resolved.error).toMatch(/4700|user:read:admin/i);
  });
});
