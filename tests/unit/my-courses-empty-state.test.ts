import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { listCourseOffers } from "@/services/learning/course-offers-service";
import { NOTIFICATION_CATALOG } from "@/types/notifications";

describe("my courses empty state", () => {
  it("keeps the official contact and catalogue routes", () => {
    expect(routes.courses).toBe("/courses");
    expect(routes.atpl).toBe("/atpl");
    expect(routes.contact).toBe("/contact");
  });

  it("registers an in-app onboarding notification", () => {
    expect(NOTIFICATION_CATALOG["course.onboarding"]?.defaultTitle).toBe(
      "Welcome to Aviator Pass!",
    );
    expect(NOTIFICATION_CATALOG["course.onboarding"]?.defaultBody).toContain(
      "enrolling in your first course",
    );
  });

  it("returns the four featured programmes with enrol CTAs", () => {
    ensurePaymentsSeeded();
    const { featured } = listCourseOffers({ userId: "user-empty-state-test" });
    expect(featured.map((offer) => offer.title)).toEqual([
      "ATPL Course",
      "Basics of Aviation",
      "Private Pilot License",
      "ELP Mock Exams",
    ]);
    for (const offer of featured) {
      expect(offer.description.length).toBeGreaterThan(20);
      expect(offer.durationLabel.length).toBeGreaterThan(2);
      expect(offer.priceLabel.length).toBeGreaterThan(0);
      expect(offer.enrollHref.length).toBeGreaterThan(1);
      expect(offer.imageUrl.length).toBeGreaterThan(1);
    }
  });

  it("recommends ATPL first for GCC students and Basics otherwise", () => {
    ensurePaymentsSeeded();
    const gcc = listCourseOffers({ userId: "user-kw", countryCode: "KW" });
    expect(gcc.recommended[0]?.id).toBe("atpl");
    const other = listCourseOffers({ userId: "user-us", countryCode: "US" });
    expect(other.recommended[0]?.id).toBe("basics");
  });

  it("uses previous activity when ranking recommendations", () => {
    ensurePaymentsSeeded();
    const ranked = listCourseOffers({
      userId: "user-elp",
      countryCode: "US",
      activityHints: ["Completed ELP practice"],
    });
    expect(ranked.recommended[0]?.id).toBe("elp");
  });

  it("replaces the dead-end empty copy with onboarding actions", () => {
    const view = readFileSync(
      path.join(process.cwd(), "features/learning/components/my-courses-view.tsx"),
      "utf8",
    );
    expect(view).toContain("MyCoursesEmptyState");
    expect(view).not.toContain("No enrolled courses");
    const empty = readFileSync(
      path.join(process.cwd(), "features/learning/components/my-courses-empty-state.tsx"),
      "utf8",
    );
    expect(empty).toContain("No courses yet");
    expect(empty).toContain("Browse Courses");
    expect(empty).toContain("Explore ATPL Course");
    expect(empty).toContain("Contact Advisor");
    expect(empty).toContain("Recommended for you");
    expect(empty).toContain("Enrol now");
    const dash = readFileSync(
      path.join(
        process.cwd(),
        "features/learning/components/student-dashboard/student-dashboard-view.tsx",
      ),
      "utf8",
    );
    expect(dash).toContain("Welcome to Aviator Pass!");
    expect(dash).toContain("Start by enrolling in your first course.");
  });
});
