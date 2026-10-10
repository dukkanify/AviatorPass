/**
 * Opening one classroom must not hydrate aep-classes.json.
 * Live class + Zoom meeting rows live in the indexed catalog.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getStoredLiveClass,
  getStoredZoomMeetingByClassId,
  getStoredZoomMeetingByNumber,
  resetClassCatalogStoreRuntime,
  upsertLiveClass,
  upsertZoomMeeting,
} from "@/lib/data/lms-class-catalog-store";
import { getLiveClass } from "@/services/classes/class-service";
import {
  lookupLiveClass,
  lookupZoomMeetingByClassId,
  writeClassesDb,
} from "@/services/classes/store";
import {
  ensureLiveMeetingForClass,
  getZoomMeetingByClassId,
  getZoomMeetingByNumber,
} from "@/services/classes/zoom-service";
import type { LiveClass, ZoomMeetingRecord } from "@/types/classes";

const PREFIX = "join-speed-";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testClass(suffix: string): LiveClass {
  const now = new Date().toISOString();
  return {
    id: `${PREFIX}cls-${suffix}`,
    title: `Join speed ${suffix}`,
    description: "Indexed classroom lookup",
    courseId: null,
    moduleId: null,
    lessonId: null,
    instructorId: `${PREFIX}instructor`,
    assistantInstructorId: null,
    startsAt: now,
    endsAt: now,
    durationMinutes: 60,
    timezone: "UTC",
    maxStudents: 12,
    meetingType: "meeting",
    status: "scheduled",
    zoomMeetingId: `${PREFIX}zm-${suffix}`,
    recurringRuleId: null,
    parentClassId: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function testMeeting(suffix: string, liveClassId: string): ZoomMeetingRecord {
  const now = new Date().toISOString();
  const zoomMeetingId = `8652492${suffix.replace(/\D/g, "").padStart(4, "0").slice(0, 4)}`;
  return {
    id: `${PREFIX}zm-${suffix}`,
    liveClassId,
    zoomMeetingId,
    zoomUuid: `${PREFIX}uuid-${suffix}`,
    joinUrl: `https://zoom.us/j/${zoomMeetingId}`,
    startUrl: `https://zoom.us/s/${zoomMeetingId}?zak=join-speed`,
    password: "Join1",
    hostEmail: "ceo@aviatorpass.com",
    waitingRoom: false,
    passcodeEnabled: true,
    coHostEmails: [],
    providerMode: "mock",
    hostId: null,
    timezone: "UTC",
    durationMinutes: 60,
    startTime: now,
    status: "scheduled",
    oauthUserId: null,
    participantCount: null,
    raw: { indexed: true },
    createdAt: now,
    updatedAt: now,
  };
}

function cleanup(classId: string) {
  writeClassesDb((db) => {
    db.classes = db.classes.filter((row) => row.id !== classId);
    db.zoomMeetings = db.zoomMeetings.filter((row) => row.liveClassId !== classId);
  });
  resetClassCatalogStoreRuntime();
}

describe("class join speed contracts", () => {
  it("looks up one class and meeting from the indexed catalog first", () => {
    const live = src("services/classes/class-service.ts");
    const getLive = live.slice(
      live.indexOf("export function getLiveClass"),
      live.indexOf("export function meetingAudienceStatus"),
    );
    expect(getLive).toMatch(/lookupLiveClass\(/);
    expect(getLive.indexOf("lookupLiveClass")).toBeLessThan(getLive.indexOf("ensureClassesSeeded"));
    expect(getLive.indexOf("lookupLiveClass")).toBeLessThan(getLive.indexOf("readClassesDb"));

    const zoom = src("services/classes/zoom-service.ts");
    const ensure = zoom.slice(
      zoom.indexOf("export async function ensureLiveMeetingForClass"),
      zoom.indexOf("type ZoomMeetingDetails"),
    );
    expect(ensure).toMatch(/lookupLiveClass\(/);
    expect(ensure).toMatch(/lookupZoomMeetingByClassId\(/);
    expect(ensure).not.toMatch(/readClassesDb\(/);
    expect(ensure).toMatch(/ensureInAppJoinSettings\(existing\)/);

    const byClass = zoom.slice(
      zoom.indexOf("export function getZoomMeetingByClassId"),
      zoom.indexOf("export function getZoomMeetingByNumber"),
    );
    expect(byClass).toMatch(/lookupZoomMeetingByClassId\(/);
    expect(byClass).not.toMatch(/readClassesDb\(/);

    const byNumber = zoom.slice(
      zoom.indexOf("export function getZoomMeetingByNumber"),
      zoom.indexOf("export type StoredZoomSession"),
    );
    expect(byNumber).toMatch(/lookupZoomMeetingByNumber\(/);
    expect(byNumber).not.toMatch(/readClassesDb\(/);

    expect(zoom).not.toMatch(/readClassesDb\(/);
    const join = src("app/api/classes/[id]/join/route.ts");
    expect(join).toMatch(/ensureLiveMeetingForClass/);
    expect(join).toMatch(/void markJoin\(/);
    expect(join).not.toMatch(/await markJoin\(/);
    expect(src("services/classes/zoom-service.ts")).toMatch(
      /export async function ensureInAppJoinSettings[\s\S]*upsertZoomMeeting\(next\)/,
    );
    expect(src("lib/data/lms-class-catalog-store.ts")).toMatch(/aep_lms_live_classes/);
    expect(src("lib/data/lms-class-catalog-store.ts")).toMatch(/aep_lms_zoom_meetings/);
    expect(src("services/classes/store.ts")).toMatch(/syncClassCatalog/);
  });
});

describe("indexed class catalog", () => {
  afterEach(() => {
    cleanup(`${PREFIX}cls-catalog`);
    cleanup(`${PREFIX}cls-blob`);
    cleanup(`${PREFIX}cls-ensure`);
  });

  it("returns one class and meeting without scanning the classes blob", () => {
    const liveClass = testClass("catalog");
    const meeting = testMeeting("catalog", liveClass.id);
    upsertLiveClass(liveClass);
    upsertZoomMeeting(meeting);
    resetClassCatalogStoreRuntime();

    expect(getStoredLiveClass(liveClass.id)?.title).toBe(liveClass.title);
    expect(getStoredZoomMeetingByClassId(liveClass.id)?.zoomMeetingId).toBe(meeting.zoomMeetingId);
    expect(getStoredZoomMeetingByNumber(meeting.zoomMeetingId)?.id).toBe(meeting.id);
    expect(getLiveClass(liveClass.id)?.id).toBe(liveClass.id);
    expect(getZoomMeetingByClassId(liveClass.id)?.zoomMeetingId).toBe(meeting.zoomMeetingId);
    expect(getZoomMeetingByNumber(meeting.zoomMeetingId)?.liveClassId).toBe(liveClass.id);
  });

  it("dual-writes the catalog when the classes blob is saved", () => {
    const liveClass = testClass("blob");
    const meeting = testMeeting("blob", liveClass.id);
    writeClassesDb((db) => {
      db.classes = db.classes.filter((row) => row.id !== liveClass.id);
      db.zoomMeetings = db.zoomMeetings.filter((row) => row.liveClassId !== liveClass.id);
      db.classes.push(liveClass);
      db.zoomMeetings.push(meeting);
    });
    resetClassCatalogStoreRuntime();

    expect(lookupLiveClass(liveClass.id)?.id).toBe(liveClass.id);
    expect(lookupZoomMeetingByClassId(liveClass.id)?.id).toBe(meeting.id);
  });

  it("reuses an indexed live meeting on join without hydrating the blob", async () => {
    const liveClass = testClass("ensure");
    const meeting = testMeeting("ensure", liveClass.id);
    upsertLiveClass(liveClass);
    upsertZoomMeeting(meeting);
    resetClassCatalogStoreRuntime();

    const existing = await ensureLiveMeetingForClass(liveClass.id, "actor-join-speed");
    expect(existing?.id).toBe(meeting.id);
    expect(existing?.zoomMeetingId).toBe(meeting.zoomMeetingId);
  });
});
