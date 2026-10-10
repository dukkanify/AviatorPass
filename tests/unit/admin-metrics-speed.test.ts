import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getPlatformOverview,
  getPlatformOverviewCounts,
  getSuperAdminDashboardPayload,
} from "@/services/dashboard/metrics";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("super admin metrics speed", () => {
  it("counts people and courses without hydrating users, sessions, or unpaid orders", () => {
    expect(src("lib/data/auth-identity-store.ts")).toMatch(/export function countUsersByRole/);
    expect(src("lib/data/auth-identity-store.ts")).toMatch(/export function countActiveSessions/);
    expect(src("lib/data/auth-identity-store.ts")).toMatch(
      /export function listStudentGrowthMonths/,
    );
    expect(src("lib/data/lms-payment-ledger-store.ts")).toMatch(
      /export function countOrdersByStatus/,
    );
    expect(src("services/payments/report-service.ts")).toMatch(/countOrdersByStatus\("pending"\)/);
    expect(src("services/payments/report-service.ts")).not.toMatch(
      /listOrdersByStatus\("pending"\)/,
    );
    expect(src("app/api/dashboard/metrics/route.ts")).toMatch(/getSuperAdminDashboardPayload\(/);
    expect(src("app/api/dashboard/metrics/route.ts")).toMatch(/getSuperAdminCountsPayload\(/);
    expect(src("app/api/dashboard/metrics/route.ts")).toMatch(/part === "counts"/);
    expect(src("features/dashboard/super-admin-dashboard-view.tsx")).toMatch(/part=counts/);
    expect(src("services/dashboard/metrics.ts")).toMatch(/getPlatformClassCounts\(/);
    expect(src("services/dashboard/metrics.ts")).toMatch(/lookupAllLiveClasses\(/);
    expect(src("services/dashboard/metrics.ts")).not.toMatch(/readClassesDb\(/);
    const counts = getPlatformOverviewCounts();
    expect(counts.totalStudents).toBeGreaterThanOrEqual(0);
    expect(counts.totalCourses).toBeGreaterThanOrEqual(0);
    expect(counts.monthlyRevenue).toBe(0);
    expect(() => getPlatformOverview()).not.toThrow();
    expect(getSuperAdminDashboardPayload().overview.totalCourses).toBeGreaterThanOrEqual(0);
  });
});
