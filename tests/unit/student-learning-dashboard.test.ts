import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { STUDENT_NAV } from "@/constants/dashboard-nav";
import {
  STUDENT_LEARNING_NAV_GROUPS,
  STUDENT_LEARNING_NAV_ITEMS,
  studentNavCoversAllRoutes,
} from "@/constants/student-learning-nav";
import {
  academicGpa,
  clampPercent,
  computeXp,
  countdownLabel,
  dailyMotivationQuote,
  estimatedCompletion,
  firstNameOf,
  greetingForHour,
  nextFlightMilestone,
  pilotLevelFromXp,
  weatherForCountry,
  weekDays,
} from "@/features/learning/components/student-dashboard/student-dashboard-utils";

const root = process.cwd();

describe("student learning navigation", () => {
  it("keeps every existing student route reachable", () => {
    expect(studentNavCoversAllRoutes()).toBe(true);
    const grouped = new Set(STUDENT_LEARNING_NAV_ITEMS.map((item) => item.href));
    for (const item of STUDENT_NAV) {
      expect(grouped.has(item.href)).toBe(true);
    }
  });

  it("groups the primary learning destinations", () => {
    const learning = STUDENT_LEARNING_NAV_GROUPS.find((group) => group.id === "learning");
    expect(learning?.items.map((item) => item.href)).toEqual([
      "/student/dashboard",
      "/student/courses",
      "/student/calendar",
      "/student/planner",
      "/student/mock-exams",
      "/student/resources",
    ]);
  });
});

describe("student dashboard copy helpers", () => {
  it("greets by time of day", () => {
    expect(greetingForHour(8)).toBe("Good Morning");
    expect(greetingForHour(14)).toBe("Good Afternoon");
    expect(greetingForHour(20)).toBe("Good Evening");
  });

  it("formats progress and first names for the hero", () => {
    expect(firstNameOf("Omar Khalil")).toBe("Omar");
    expect(clampPercent(146)).toBe(100);
    expect(clampPercent(-4)).toBe(0);
    expect(estimatedCompletion(100)).toBe("Course complete");
  });

  it("builds a Sunday-first week and live countdown", () => {
    const days = weekDays(new Date("2026-09-07T10:00:00"));
    expect(days).toHaveLength(7);
    expect(new Date(days[0]!.key).getDay()).toBe(0);
    expect(countdownLabel("2026-09-07T10:45:00.000Z", Date.parse("2026-09-07T10:00:00.000Z"))).toBe(
      "45m",
    );
  });

  it("derives pilot level, weather, and motivation from learning progress", () => {
    expect(
      pilotLevelFromXp(
        computeXp({
          completedLessons: 4,
          learningHours: 8,
          certificates: 1,
          progressPercent: 40,
        }),
      ).name,
    ).toBeTruthy();
    expect(weatherForCountry("AE").city).toBe("Dubai");
    expect(dailyMotivationQuote(new Date("2026-09-08T10:00:00"))).toContain(" ");
    expect(nextFlightMilestone(10)).toContain("Principles");
    expect(academicGpa(80, 10)).toBeGreaterThan(3);
  });
});

describe("student dashboard isolation", () => {
  it("does not mount students in the admin RoleShell", () => {
    const layout = readFileSync(resolve(root, "app/(student)/layout.tsx"), "utf8");
    expect(layout).toContain("StudentLearningShell");
    expect(layout).not.toContain("RoleShell");
    expect(layout).not.toContain("STUDENT_NAV");
  });

  it("does not reuse admin dashboard widgets on the student home", () => {
    const view = readFileSync(
      resolve(root, "features/learning/components/student-dashboard/student-dashboard-view.tsx"),
      "utf8",
    );
    expect(view).not.toContain("@/components/dashboard");
    expect(view).toContain("Continue Learning");
    expect(view).toContain("today-learning-title");
    expect(view).toContain("Upcoming Live Session");
    expect(view).toContain("Study Planner");
    expect(view).toContain("Quick Actions");
    expect(view).toContain("Student Level");
    expect(view).toContain("Learning heatmap");
    expect(view).toContain("Notifications");
  });

  it("gives the student shell a collapsible sidebar and profile menu", () => {
    const shell = readFileSync(
      resolve(root, "components/layout/student-learning-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain("data-collapsed");
    expect(shell).toContain("ThemeToggle");
    expect(shell).toContain("Open profile menu");
    expect(shell).toContain("NotificationBell");
  });
});
