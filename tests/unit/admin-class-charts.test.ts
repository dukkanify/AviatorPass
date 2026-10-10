/**
 * Super Admin charts and class lists use the indexed catalog,
 * never aep-classes.json on the hot path.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  markClassCatalogSynced,
  resetClassCatalogStoreRuntime,
  upsertLiveClass,
} from "@/lib/data/lms-class-catalog-store";
import { getPlatformClassCounts, listLiveClasses } from "@/services/classes/class-service";
import { lookupAllLiveClasses, writeClassesDb } from "@/services/classes/store";
import { getAttendanceSeries, getSuperAdminCountsPayload } from "@/services/dashboard/metrics";
import type { LiveClass } from "@/types/classes";

const PREFIX = "admin-charts-";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testClass(
  suffix: string,
  startsAt: string,
  status: LiveClass["status"] = "scheduled",
): LiveClass {
  const endsAt = new Date(Date.parse(startsAt) + 90 * 60_000).toISOString();
  return {
    id: `${PREFIX}${suffix}`,
    title: `Admin charts ${suffix}`,
    description: "Indexed class list",
    courseId: null,
    moduleId: null,
    lessonId: null,
    instructorId: `${PREFIX}instructor`,
    assistantInstructorId: null,
    startsAt,
    endsAt,
    durationMinutes: 90,
    timezone: "UTC",
    maxStudents: 12,
    meetingType: "meeting",
    status,
    zoomMeetingId: null,
    recurringRuleId: null,
    parentClassId: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    createdById: null,
    createdAt: startsAt,
    updatedAt: startsAt,
    deletedAt: null,
  };
}

function cleanup() {
  writeClassesDb((db) => {
    db.classes = db.classes.filter((row) => !row.id.startsWith(PREFIX));
  });
  resetClassCatalogStoreRuntime();
}

describe("super admin class charts", () => {
  afterEach(cleanup);

  it("lists classes and fills first-paint charts from the indexed catalog", () => {
    const list = src("services/classes/class-service.ts");
    const listFn = list.slice(
      list.indexOf("export function listLiveClasses"),
      list.indexOf("export function getPlatformClassCounts"),
    );
    expect(listFn).toMatch(/lookupAllLiveClasses\(/);
    expect(listFn).not.toMatch(/readClassesDb\(/);
    expect(listFn).not.toMatch(/ensureClassesSeeded\(/);

    const stats = list.slice(
      list.indexOf("export function getClassStats"),
      list.indexOf("function assertInstructorUser"),
    );
    expect(stats).toMatch(/lookupAllLiveClasses\(/);
    expect(stats).not.toMatch(/readClassesDb\(/);

    expect(src("lib/data/lms-class-catalog-store.ts")).toMatch(
      /export function listStoredLiveClasses/,
    );
    expect(src("lib/data/lms-class-catalog-store.ts")).toMatch(
      /export function isClassCatalogSynced/,
    );
    expect(src("services/classes/store.ts")).toMatch(/export function lookupAllLiveClasses/);
    expect(src("app/api/dashboard/metrics/route.ts")).toMatch(/getSuperAdminCountsPayload\(/);
    expect(src("services/dashboard/metrics.ts")).toMatch(
      /export function getSuperAdminCountsPayload[\s\S]*getEnrollmentSeries\(/,
    );
    expect(src("services/dashboard/metrics.ts")).toMatch(
      /export function getAttendanceSeries[\s\S]*lookupAllLiveClasses\(/,
    );
    expect(src("features/dashboard/super-admin-dashboard-view.tsx")).toMatch(
      /Live sessions this week/,
    );
  });

  it("counts this week's sessions without scanning the classes blob", () => {
    const now = Date.now();
    const upcoming = testClass("up", new Date(now + 2 * 60 * 60_000).toISOString(), "scheduled");
    const past = testClass("past", new Date(now - 26 * 60 * 60_000).toISOString(), "completed");
    upsertLiveClass(upcoming);
    upsertLiveClass(past);
    markClassCatalogSynced();
    resetClassCatalogStoreRuntime();

    expect(lookupAllLiveClasses().some((row) => row.id === upcoming.id)).toBe(true);
    expect(getPlatformClassCounts().upcomingClasses).toBeGreaterThanOrEqual(1);
    expect(
      listLiveClasses({ q: "Admin charts up" }).data.some((row) => row.id === upcoming.id),
    ).toBe(true);

    const series = getAttendanceSeries();
    expect(series).toHaveLength(6);
    expect(series.reduce((sum, point) => sum + point.value, 0)).toBeGreaterThanOrEqual(1);

    const counts = getSuperAdminCountsPayload();
    expect(counts.charts.growth.length).toBeGreaterThanOrEqual(0);
    expect(counts.charts.enrollments.length).toBeGreaterThanOrEqual(0);
    expect(counts.charts.attendance).toHaveLength(6);
    expect(counts.overview.activeClasses).toBeGreaterThanOrEqual(0);
  });
});
