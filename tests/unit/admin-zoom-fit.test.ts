import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNT_PASSWORD, PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { ensureCatalogDemoPassword } from "@/services/auth/demo-users";
import { findUserByEmail, writeAuthDb } from "@/services/auth/store";
import { verifyPassword } from "@/lib/security/crypto";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("super admin password and wrapped classroom", () => {
  it("restores DemoPass123! on a Super Admin that was seeded without a hash", () => {
    const email = PRIMARY_DEMO_EMAILS.superAdmin;
    writeAuthDb((db) => {
      const row = db.users.find((user) => user.email === email);
      if (!row) return;
      row.passwordHash = null;
      row.passwordSalt = null;
    });
    const restored = ensureCatalogDemoPassword(findUserByEmail(email)!);
    expect(restored.passwordHash).toBeTruthy();
    expect(
      verifyPassword(DEMO_ACCOUNT_PASSWORD, restored.passwordHash!, restored.passwordSalt!),
    ).toBe(true);
    expect(src("services/auth/auth-service.ts")).toMatch(/ensureCatalogDemoPassword\(user\)/);
  });

  it("sizes the Zoom Component View to fill the lesson stage", () => {
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/stageVideoSize\(/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/viewSizes/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/ResizeObserver/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/MutationObserver/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/pinZoomWindowToStage\(/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/innerCenter/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/min\(72vh, 820px\)/);
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toContain(
      'import "@/styles/classroom.css"',
    );
    expect(src("features/learning/components/course-player-view.tsx")).toContain(
      'import "@/styles/classroom.css"',
    );
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(
      /classroom-stage[\s\S]*is-live/,
    );
    expect(src("styles/classroom.css")).toMatch(/classroom-sdk-root\.is-live/);
    expect(src("styles/classroom.css")).toMatch(/width: 100% !important/);
    expect(src("styles/classroom.css")).toMatch(/suspension-view-tabpanel/);
    expect(src("app/api/dashboard/metrics/route.ts")).toMatch(
      /scope === ROLES.SUPER_ADMIN[\s\S]*getSuperAdminCountsPayload\(/,
    );
    expect(src("features/learning/components/course-player-view.tsx")).toMatch(
      /classroom\?\.join && "hidden"/,
    );
  });

  it("loads the Super Admin dashboard without the course or class blobs", () => {
    const metrics = src("services/dashboard/metrics.ts");
    const overview = metrics.slice(
      metrics.indexOf("function buildPlatformOverview"),
      metrics.indexOf("export function getGrowthSeries"),
    );
    expect(overview).toMatch(/getFastCourseStats\(/);
    expect(overview).toMatch(/countUsersByRole\(/);
    expect(overview).not.toMatch(/listAllUsers\(/);
    expect(overview).not.toMatch(/readClassesDb\(/);
    expect(overview).not.toMatch(/getCourseStats\(/);
    expect(src("services/courses/course-service.ts")).toMatch(/export function getFastCourseStats/);
    expect(src("lib/data/lms-course-detail-store.ts")).toMatch(
      /export function countStoredCourses/,
    );
    expect(src("services/dashboard/metrics.ts")).toMatch(/listStoredCourseSummaries\(/);
    expect(src("services/dashboard/metrics.ts")).not.toMatch(/listStoredCourseDetails\(/);
    expect(src("app/(super-admin)/super-admin/dashboard/page.tsx")).not.toMatch(
      /getPlatformOverview/,
    );
    expect(src("app/(super-admin)/super-admin/loading.tsx")).toMatch(/Platform overview/);
    expect(src("app/(super-admin)/super-admin/loading.tsx")).not.toMatch(/PageSkeleton/);
  });
});
