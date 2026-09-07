/**
 * Instructor Zoom General OAuth — connect, refresh, meetings, access rules.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import {
  cancelLiveClass,
  createLiveClass,
  getJoinInfoForUser,
  getLiveClassDetail,
  updateLiveClass,
} from "@/services/classes/class-service";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { writeClassesDb } from "@/services/classes/store";
import { getPublicJoinInfo, getZoomMeetingByClassId } from "@/services/classes/zoom-service";
import { instructorMeetingPayload } from "@/services/zoom/client";
import { decryptSecret, encryptSecret, looksEncrypted } from "@/services/zoom/crypto";
import {
  completeZoomOAuthCallback,
  buildZoomAuthorizeUrl,
  disconnectZoomIntegration,
  getInstructorZoomStatus,
  refreshInstructorAccessToken,
} from "@/services/zoom/oauth-service";
import { sanitizeJoinInfoForViewer } from "@/services/zoom/policy";
import { resetZoomStoreForTests, upsertIntegration } from "@/services/zoom/store";
import { zoomUrlValidationResponse } from "@/services/zoom/webhook-service";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function instructor() {
  return readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
}

function student() {
  return readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active")!;
}

function resetClasses() {
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
}

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.ZOOM_CLIENT_ID = "zoom-client-id";
  process.env.ZOOM_CLIENT_SECRET = "zoom-client-secret";
  process.env.ZOOM_REDIRECT_URI = "https://www.aviatorpass.com/api/integrations/zoom/callback";
  process.env.ZOOM_BASE_URL = "https://api.zoom.us/v2";
  process.env.ZOOM_SECRET_TOKEN = "zoom-secret-token";
  resetZoomStoreForTests();
  ensureDemoUsersSeeded();
  resetClasses();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("Zoom token encryption", () => {
  it("encrypts and decrypts access tokens", () => {
    const cipher = encryptSecret("zoom-access-token-value");
    expect(looksEncrypted(cipher)).toBe(true);
    expect(cipher).not.toContain("zoom-access-token-value");
    expect(decryptSecret(cipher)).toBe("zoom-access-token-value");
  });
});

describe("Zoom OAuth connect + callback", () => {
  it("builds an authorize URL with signed state", () => {
    const url = buildZoomAuthorizeUrl({ userId: instructor().id });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://zoom.us/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("zoom-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toContain("/api/integrations/zoom/callback");
    expect(parsed.searchParams.get("state")).toBeTruthy();
  });

  it("exchanges the code and stores encrypted tokens", async () => {
    const user = instructor();
    const authorize = new URL(buildZoomAuthorizeUrl({ userId: user.id }));
    const state = authorize.searchParams.get("state")!;

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-live",
            refresh_token: "refresh-live",
            token_type: "bearer",
            expires_in: 3600,
            scope: "meeting:write:meeting",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/users/me")) {
        return new Response(
          JSON.stringify({
            id: "zuid-1",
            email: "instructor.zoom@example.com",
            first_name: "Sky",
            timezone: "Europe/London",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await completeZoomOAuthCallback({ code: "auth-code", state, error: null });
    expect(result.redirectTo).toContain("zoom=connected");
    const status = getInstructorZoomStatus(user.id);
    expect(status.connected).toBe(true);
    expect(status.zoomEmail).toBe("instructor.zoom@example.com");
    expect(status.zoomUserId).toBe("zuid-1");

    const { getIntegrationByUserId } = await import("@/services/zoom/store");
    const row = getIntegrationByUserId(user.id)!;
    expect(row.accessToken).not.toBe("access-live");
    expect(decryptSecret(row.accessToken)).toBe("access-live");
    expect(decryptSecret(row.refreshToken)).toBe("refresh-live");
  });

  it("records OAuth failure without storing tokens", async () => {
    const result = await completeZoomOAuthCallback({
      code: null,
      state: null,
      error: "access_denied",
    });
    expect(result.redirectTo).toContain("zoom=error");
    expect(getInstructorZoomStatus(instructor().id).connected).toBe(false);
  });
});

describe("Zoom token refresh + disconnect + reconnect", () => {
  it("refreshes expired access tokens transparently", async () => {
    const user = instructor();
    upsertIntegration({
      id: "int-1",
      userId: user.id,
      zoomUserId: "zuid-1",
      zoomEmail: "instructor.zoom@example.com",
      accessToken: encryptSecret("old-access"),
      refreshToken: encryptSecret("old-refresh"),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: "connected",
      scopes: "meeting:write:meeting",
      cachedProfile: {
        zoomUserId: "zuid-1",
        email: "instructor.zoom@example.com",
        firstName: "Sky",
        lastName: null,
        timezone: "UTC",
        accountId: null,
        type: 1,
      },
      profileCachedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const token = await refreshInstructorAccessToken(user.id);
    expect(token).toBe("new-access");
    const { getIntegrationByUserId } = await import("@/services/zoom/store");
    expect(decryptSecret(getIntegrationByUserId(user.id)!.accessToken)).toBe("new-access");
  });

  it("disconnects the instructor integration", async () => {
    const user = instructor();
    upsertIntegration({
      id: "int-2",
      userId: user.id,
      zoomUserId: "zuid-2",
      zoomEmail: "leave@example.com",
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: "connected",
      scopes: "",
      cachedProfile: null,
      profileCachedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    globalThis.fetch = vi.fn(async () => new Response("", { status: 200 })) as typeof fetch;
    await disconnectZoomIntegration(user.id);
    expect(getInstructorZoomStatus(user.id).connected).toBe(false);
    expect(getInstructorZoomStatus(user.id).status).toBe("disconnected");
  });
});

describe("Zoom meeting lifecycle", () => {
  it("uses the required scheduled-meeting settings", () => {
    const payload = instructorMeetingPayload({
      topic: "ATPL PASS",
      agenda: "Air law briefing",
      startTime: "2026-09-08T10:00:00.000Z",
      durationMinutes: 90,
      timezone: "Europe/London",
    });
    expect(payload.type).toBe(2);
    expect(payload.settings.host_video).toBe(true);
    expect(payload.settings.participant_video).toBe(false);
    expect(payload.settings.mute_upon_entry).toBe(true);
    expect(payload.settings.waiting_room).toBe(true);
    expect(payload.settings.approval_type).toBe(0);
    expect(payload.settings.join_before_host).toBe(false);
    expect(payload.settings.meeting_authentication).toBe(false);
  });

  it("creates a meeting via instructor OAuth and hides the start URL from students", async () => {
    const user = instructor();
    const learner = student();
    upsertIntegration({
      id: "int-3",
      userId: user.id,
      zoomUserId: "zuid-3",
      zoomEmail: "host@example.com",
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: "connected",
      scopes: "",
      cachedProfile: {
        zoomUserId: "zuid-3",
        email: "host@example.com",
        firstName: null,
        lastName: null,
        timezone: "UTC",
        accountId: null,
        type: 1,
      },
      profileCachedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/users/me/meetings") && init && String(init.method) === "POST") {
        return new Response(
          JSON.stringify({
            id: 987654321,
            uuid: "uuid-1",
            host_id: "zuid-3",
            join_url: "https://zoom.us/j/987654321",
            start_url: "https://zoom.us/s/987654321?zak=secret",
            password: "pass123",
            timezone: "UTC",
            duration: 60,
            start_time: "2026-10-01T12:00:00Z",
            status: "waiting",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const created = await createLiveClass({
      title: "OAuth Zoom class",
      description: "Nav briefing",
      instructorId: user.id,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      durationMinutes: 60,
      timezone: "UTC",
      enrollStudentIds: [learner.id],
      actorId: user.id,
    });

    const meeting = getZoomMeetingByClassId(created!.id)!;
    expect(meeting.providerMode).toBe("zoom");
    expect(meeting.zoomMeetingId).toBe("987654321");
    expect(meeting.oauthUserId).toBe(user.id);
    expect(meeting.startUrl).toContain("zak=secret");

    const studentJoin = getJoinInfoForUser(created!.id, learner.id);
    expect(studentJoin.isHost).toBe(false);
    expect(studentJoin.join?.startUrl).toBeNull();
    expect(studentJoin.join?.joinUrl).toContain("987654321");
    expect(studentJoin.audienceStatus).toBe("Upcoming");

    const instructorJoin = getJoinInfoForUser(created!.id, user.id);
    expect(instructorJoin.isHost).toBe(true);
    expect(instructorJoin.join?.startUrl).toContain("zak=secret");

    const studentDetail = getLiveClassDetail(created!.id, { id: learner.id, role: ROLES.STUDENT });
    expect(studentDetail?.zoom?.startUrl).toBeNull();
    const instructorDetail = getLiveClassDetail(created!.id, {
      id: user.id,
      role: ROLES.INSTRUCTOR,
    });
    expect(instructorDetail?.zoom?.startUrl).toContain("zak=secret");
  });

  it("updates the existing meeting instead of creating a duplicate", async () => {
    const user = instructor();
    upsertIntegration({
      id: "int-4",
      userId: user.id,
      zoomUserId: "zuid-4",
      zoomEmail: "host@example.com",
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: "connected",
      scopes: "",
      cachedProfile: null,
      profileCachedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let patches = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init ? String(init.method) : "GET";
      if (url.endsWith("/users/me/meetings") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 111,
            uuid: "u1",
            join_url: "https://zoom.us/j/111",
            start_url: "https://zoom.us/s/111",
            password: "x",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/meetings/111") && method === "PATCH") {
        patches += 1;
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const created = await createLiveClass({
      title: "Patch me",
      instructorId: user.id,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      durationMinutes: 60,
      actorId: user.id,
    });
    await updateLiveClass({
      id: created!.id,
      patch: { title: "Patched title", durationMinutes: 90 },
      actorId: user.id,
    });
    const meetings = writeClassesDb((db) => db).zoomMeetings.filter(
      (z) => z.liveClassId === created!.id,
    );
    expect(meetings).toHaveLength(1);
    expect(patches).toBe(1);
    expect(meetings[0]?.zoomMeetingId).toBe("111");
  });

  it("deletes the Zoom meeting and removes local references", async () => {
    const user = instructor();
    upsertIntegration({
      id: "int-5",
      userId: user.id,
      zoomUserId: "zuid-5",
      zoomEmail: "host@example.com",
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: "connected",
      scopes: "",
      cachedProfile: null,
      profileCachedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let deleted = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init ? String(init.method) : "GET";
      if (url.endsWith("/users/me/meetings") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: 222,
            uuid: "u2",
            join_url: "https://zoom.us/j/222",
            start_url: "https://zoom.us/s/222",
            password: "y",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/meetings/222") && method === "DELETE") {
        deleted += 1;
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const created = await createLiveClass({
      title: "Delete me",
      instructorId: user.id,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      durationMinutes: 45,
      actorId: user.id,
    });
    await cancelLiveClass({ id: created!.id, actorId: user.id, reason: "Weather" });
    expect(deleted).toBe(1);
    expect(getZoomMeetingByClassId(created!.id)).toBeNull();
  });
});

describe("Zoom viewer policy", () => {
  it("never exposes the start URL to students", () => {
    const info = sanitizeJoinInfoForViewer(
      {
        id: "m1",
        liveClassId: "c1",
        zoomMeetingId: "333",
        zoomUuid: "u",
        joinUrl: "https://zoom.us/j/333",
        startUrl: "https://zoom.us/s/333?zak=hidden",
        password: "p",
        hostEmail: "h@example.com",
        waitingRoom: true,
        passcodeEnabled: true,
        coHostEmails: [],
        providerMode: "zoom",
        hostId: "host",
        participantCount: 4,
        raw: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      false,
    );
    expect(info?.startUrl).toBeNull();
    expect(info?.hostId).toBeNull();
    expect(info?.participantCount).toBeNull();
    expect(info?.joinUrl).toBe("https://zoom.us/j/333");
    expect(getPublicJoinInfo("missing", false)).toBeNull();
  });

  it("validates Zoom webhook URL tokens", () => {
    const result = zoomUrlValidationResponse("plain-token");
    expect(result.plainToken).toBe("plain-token");
    expect(result.encryptedToken).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("Zoom webhook HTTP surface", () => {
  it("returns 405 JSON for GET so browsers never bounce to the homepage", async () => {
    const { GET, HEAD } = await import("@/app/api/integrations/zoom/webhook/route");
    const get = GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(get.headers.get("Cache-Control")).toBe("no-store");
    await expect(get.json()).resolves.toEqual({
      error: "Method not allowed",
      allowed: ["POST", "OPTIONS"],
    });
    const head = HEAD();
    expect(head.status).toBe(405);
    expect(head.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("answers OPTIONS with 204", async () => {
    const { OPTIONS } = await import("@/app/api/integrations/zoom/webhook/route");
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("answers Zoom URL validation without a signature", async () => {
    const { POST } = await import("@/app/api/integrations/zoom/webhook/route");
    const request = new Request("https://www.aviatorpass.com/api/integrations/zoom/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "endpoint.url_validation",
        payload: { plainToken: "plain-token" },
      }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plainToken: string; encryptedToken: string };
    expect(json.plainToken).toBe("plain-token");
    expect(json.encryptedToken).toMatch(/^[a-f0-9]{64}$/);
  });
});
