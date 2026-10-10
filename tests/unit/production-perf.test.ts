import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function src(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("production performance contracts", () => {
  it("prioritizes the marketing and student LCP heroes with next/image", () => {
    const home = src("features/marketing/components/atpl-pass-homepage.tsx");
    const atpl = src("features/marketing/components/atpl-program-page.tsx");
    const student = src(
      "features/learning/components/student-dashboard/student-dashboard-view.tsx",
    );
    const hero = src("components/media/hero-lcp-image.tsx");
    expect(home).not.toMatch(/["']use client["']/);
    expect(home).toContain("HeroLcpImage");
    expect(home).not.toContain("backgroundImage");
    expect(atpl).toContain("HeroLcpImage");
    expect(hero).toContain("priority");
    expect(hero).toContain('fetchPriority="high"');
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain("next/image");
    expect(student).toContain("next/image");
    expect(student).toContain("priority");
    expect(student).toContain('fetchPriority="high"');
    expect(student).not.toContain("framer-motion");
  });

  it("keeps heavy widgets off the first student and admin paint", () => {
    const studentShell = src("components/layout/student-learning-shell.tsx");
    const admin = src("features/dashboard/admin-dashboard-view.tsx");
    const join = src("features/classes/components/join-class-client.tsx");
    expect(studentShell).toContain("next/dynamic");
    expect(studentShell).toContain("FloatingAiAssistant");
    expect(studentShell).toContain("CommandPalette");
    expect(admin).toContain("next/dynamic");
    expect(admin).toContain("calendar-widget");
    expect(join).toContain("next/dynamic");
    expect(src("components/dashboard/index.ts")).toContain("lazy-charts");
  });

  it("splits route CSS and caches static assets for a year", () => {
    const globals = src("styles/globals.css");
    const marketing = src("app/(marketing)/layout.tsx");
    const join = src("app/join/layout.tsx");
    const config = src("next.config.ts");
    expect(globals).not.toContain("classroom.css");
    expect(globals).not.toContain("landing.css");
    expect(globals).not.toContain("course-studio.css");
    expect(marketing).toContain("landing.css");
    expect(marketing).toContain("atpl-pass-home.css");
    expect(join).toContain("classroom.css");
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toContain("classroom.css");
    expect(src("features/learning/components/course-player-view.tsx")).toContain("classroom.css");
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/MutationObserver/);
    expect(config).toContain("max-age=31536000");
    expect(config).toContain("image/avif");
    expect(config).toContain("image/webp");
  });

  it("batches admin dashboard reads and de-dupes student GET fetches", () => {
    const adminPage = src("app/(admin)/admin/dashboard/page.tsx");
    const metrics = src("services/dashboard/metrics.ts");
    const learningApi = src("features/learning/lib/api.ts");
    const cgi = src("services/cgi/journey-service.ts");
    expect(adminPage).toContain("getAdminDashboardPayload");
    expect(metrics).toContain("export function getAdminDashboardPayload");
    expect(learningApi).toContain("cachedQuery");
    expect(cgi).toContain("slimDashboardSchedule");
    expect(cgi).toContain("planByStudent");
    const studentDash = src(
      "features/learning/components/student-dashboard/student-dashboard-view.tsx",
    );
    expect(studentDash).toContain("dashPromise");
    expect(studentDash).toContain("widgetsPromise");
    expect(studentDash.indexOf("widgetsPromise")).toBeLessThan(
      studentDash.indexOf("setLoading(false)"),
    );
    expect(src("components/notifications/notification-bell.tsx")).toContain(
      "routes.api.notificationUnreadCount",
    );
    expect(src("components/notifications/notification-bell.tsx")).toContain("void pollUnread()");
    expect(src("features/analytics/components/analytics-hub-view.tsx")).toContain(
      'from "@/components/dashboard"',
    );
    expect(src("features/analytics/components/analytics-hub-view.tsx")).not.toContain(
      'from "@/components/dashboard/charts"',
    );
    expect(src("services/auth/auth-service.ts")).toContain("getSessionById");
    expect(src("services/auth/auth-service.ts")).toContain("sessionSeedReady");
  });
});
