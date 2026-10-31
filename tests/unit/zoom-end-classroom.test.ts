import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClassesDb } from "@/services/classes/store";
import {
  endHostClassroomSession,
  releasePriorInstructorHostMeetings,
  releaseStaleLocalHostMeetings,
  resetZoomS2STokenCacheForTests,
} from "@/services/classes/zoom-service";
import type { LiveClass } from "@/types/classes";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  resetZoomS2STokenCacheForTests();
  writeClassesDb((db) => {
    db.classes = db.classes.filter(
      (row) => row.id !== "cls-end-a" && row.id !== "cls-end-b" && row.id !== "cls-end-stale",
    );
    db.zoomMeetings = db.zoomMeetings.filter(
      (row) =>
        row.liveClassId !== "cls-end-a" &&
        row.liveClassId !== "cls-end-b" &&
        row.liveClassId !== "cls-end-stale",
    );
  });
});

function s2sEnv() {
  process.env.ZOOM_ACCOUNT_ID = "acct_end";
  process.env.ZOOM_S2S_CLIENT_ID = "s2s_end";
  process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_end_secret";
}

function seedClass(input: {
  id: string;
  meetingNumber: string;
  status: LiveClass["status"];
  startsAt: string;
  endsAt: string;
}) {
  const now = new Date().toISOString();
  writeClassesDb((db) => {
    db.classes = db.classes.filter((row) => row.id !== input.id);
    db.zoomMeetings = db.zoomMeetings.filter((row) => row.liveClassId !== input.id);
    db.classes.push({
      id: input.id,
      title: input.id,
      description: "",
      courseId: null,
      moduleId: null,
      lessonId: null,
      instructorId: "instructor-end",
      assistantInstructorId: null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      durationMinutes: 60,
      timezone: "Asia/Dubai",
      maxStudents: 10,
      meetingType: "meeting",
      status: input.status,
      zoomMeetingId: `zm-${input.id}`,
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
      id: `zm-${input.id}`,
      liveClassId: input.id,
      zoomMeetingId: input.meetingNumber,
      zoomUuid: `uuid-${input.id}`,
      joinUrl: `https://zoom.us/j/${input.meetingNumber}`,
      startUrl: `https://zoom.us/s/${input.meetingNumber}?zak=tok`,
      password: "pass",
      hostEmail: "ceo@aviatorpass.com",
      hostId: "ceo-host",
      waitingRoom: false,
      passcodeEnabled: true,
      coHostEmails: [],
      providerMode: "zoom",
      status: "started",
      raw: {},
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("end classroom host release", () => {
  it("ends the Zoom instance and marks the local class completed", async () => {
    s2sEnv();
    const startsAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 50 * 60_000).toISOString();
    seedClass({
      id: "cls-end-a",
      meetingNumber: "81111111111",
      status: "live",
      startsAt,
      endsAt,
    });

    const ended = new Set<string>();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/meetings/") && url.includes("/status") && init?.method === "PUT") {
        const id = url.match(/meetings\/(\d+)/)?.[1] || "";
        ended.add(id);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/users/") && url.includes("/meetings")) {
        return new Response(JSON.stringify({ meetings: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await endHostClassroomSession({
      liveClassId: "cls-end-a",
      instructorUserId: "instructor-end",
    });
    expect(result.released).toBe(true);
    expect(result.classCompleted).toBe(true);
    expect(ended.has("81111111111")).toBe(true);

    const { readClassesDb } = await import("@/services/classes/store");
    const cls = readClassesDb().classes.find((row) => row.id === "cls-end-a");
    expect(cls?.status).toBe("completed");
    const meeting = readClassesDb().zoomMeetings.find((row) => row.liveClassId === "cls-end-a");
    expect(meeting?.status).toBe("finished");
  });

  it("clears past-window local meetings still live on Zoom but never unknown IDs", async () => {
    s2sEnv();
    seedClass({
      id: "cls-end-stale",
      meetingNumber: "82222222222",
      status: "live",
      startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      endsAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });

    const ended: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/users/") && url.includes("/meetings")) {
        return new Response(
          JSON.stringify({
            meetings: [{ id: 82222222222 }, { id: 89999999999 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/meetings/") && url.includes("/status") && init?.method === "PUT") {
        const id = url.match(/meetings\/(\d+)/)?.[1] || "";
        ended.push(id);
        return new Response(null, { status: 204 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await releaseStaleLocalHostMeetings({
      keepMeetingNumber: "83333333333",
      instructorUserId: "instructor-end",
    });
    expect(result.liveListReadable).toBe(true);
    expect(result.ended).toContain("82222222222");
    expect(ended).toContain("82222222222");
    expect(ended).not.toContain("89999999999");
  });

  it("skips in-window local meetings so real concurrent conflicts stay blocked", async () => {
    s2sEnv();
    seedClass({
      id: "cls-end-b",
      meetingNumber: "84444444444",
      status: "live",
      startsAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 50 * 60_000).toISOString(),
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/users/") && url.includes("/meetings")) {
        return new Response(JSON.stringify({ meetings: [{ id: 84444444444 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const spy = vi.fn();
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/status") && init?.method === "PUT") spy(url);
      return prevFetch(input, init);
    }) as typeof fetch;

    const result = await releaseStaleLocalHostMeetings({
      keepMeetingNumber: "85555555555",
      instructorUserId: "instructor-end",
    });
    expect(result.skippedInWindow).toContain("84444444444");
    expect(result.ended).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ends this instructor's prior in-window live meeting when starting another class", async () => {
    s2sEnv();
    seedClass({
      id: "cls-end-a",
      meetingNumber: "86666666666",
      status: "live",
      startsAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 50 * 60_000).toISOString(),
    });
    seedClass({
      id: "cls-end-b",
      meetingNumber: "87777777777",
      status: "scheduled",
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 40 * 60_000).toISOString(),
    });

    const ended: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/users/") && url.includes("/meetings")) {
        return new Response(JSON.stringify({ meetings: [{ id: 86666666666 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/meetings/") && url.includes("/status") && init?.method === "PUT") {
        const id = url.match(/meetings\/(\d+)/)?.[1] || "";
        ended.push(id);
        return new Response(null, { status: 204 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await releasePriorInstructorHostMeetings({
      keepMeetingNumber: "87777777777",
      instructorUserId: "instructor-end",
    });
    expect(result.ended).toContain("86666666666");
    expect(ended).toContain("86666666666");
    expect(result.skippedOtherInstructor).toEqual([]);
  });
});
