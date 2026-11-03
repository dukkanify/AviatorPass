import { describe, expect, it } from "vitest";

import {
  ADMIN_NAV,
  CGI_NAV,
  INSTRUCTOR_NAV,
  NAV_SLIM_REMOVED_HREFS,
  STUDENT_NAV,
  SUPER_ADMIN_NAV,
} from "@/constants/dashboard-nav";

describe("dashboard nav slim", () => {
  it("keeps role sidebars under target sizes", () => {
    expect(SUPER_ADMIN_NAV.length).toBeLessThanOrEqual(32);
    expect(ADMIN_NAV.length).toBeLessThanOrEqual(24);
    expect(INSTRUCTOR_NAV.length).toBeLessThanOrEqual(12);
    expect(CGI_NAV.length).toBeLessThanOrEqual(10);
    expect(CGI_NAV.some((item) => item.href === "/cgi/assignment")).toBe(true);
    expect(CGI_NAV.some((item) => item.href === "/cgi/subjects")).toBe(false);
    expect(STUDENT_NAV.length).toBeLessThanOrEqual(20);
  });

  it("drops duplicate / roadmap / secondary ops entries from sidebars", () => {
    for (const href of NAV_SLIM_REMOVED_HREFS.super_admin) {
      expect(SUPER_ADMIN_NAV.some((item) => item.href === href)).toBe(false);
    }
    for (const href of NAV_SLIM_REMOVED_HREFS.admin) {
      expect(ADMIN_NAV.some((item) => item.href === href)).toBe(false);
    }
    for (const href of NAV_SLIM_REMOVED_HREFS.instructor) {
      expect(INSTRUCTOR_NAV.some((item) => item.href === href)).toBe(false);
    }
    for (const href of NAV_SLIM_REMOVED_HREFS.cgi) {
      expect(CGI_NAV.some((item) => item.href === href)).toBe(false);
    }
    for (const href of NAV_SLIM_REMOVED_HREFS.student) {
      expect(STUDENT_NAV.some((item) => item.href === href)).toBe(false);
    }
  });

  it("keeps a single analytics entry per staff role", () => {
    for (const nav of [SUPER_ADMIN_NAV, ADMIN_NAV, INSTRUCTOR_NAV, CGI_NAV]) {
      const analytics = nav.filter((item) => /analytics|reports/i.test(item.label));
      expect(analytics).toHaveLength(1);
      expect(analytics[0]?.href.endsWith("/analytics")).toBe(true);
    }
  });
});
