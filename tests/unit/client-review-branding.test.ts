import { describe, expect, it } from "vitest";

import { siteStatic } from "@/config/site-static";
import { NAV_ITEMS } from "@/constants/navigation";
import { routes } from "@/constants/routes";
import { ABOUT, HERO, INSTRUCTORS } from "@/features/marketing/content/atpl-pass-home";
import {
  ATPL_FAQS,
  ATPL_LIVE_TRAINING,
  ATPL_SUBJECTS_13,
} from "@/features/marketing/content/atpl-course-landing";
import { ONLINE_COURSE_PROGRAMMES } from "@/features/marketing/content/online-courses";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";

describe("final client review copy", () => {
  it("brands the platform as Aviator Pass", () => {
    expect(siteStatic.name).toBe("Aviator Pass");
    expect(siteStatic.shortName).toBe("Aviator Pass");
    expect(HERO.primaryCta).toBe("Explore Online Courses");
    expect(ABOUT.whoWeAre).toMatch(/complete aviation education platform/i);
    expect(ABOUT.whoWeAre).not.toMatch(/focused exclusively on Airline Transport Pilot License/i);
  });

  it("uses the approved contact and support mailboxes", () => {
    expect(siteStatic.contactEmail).toBe("info@atplpass.com");
    expect(siteStatic.supportEmail).toBe("support@atplpass.com");
  });

  it("lists the four academy locations", () => {
    expect([...siteStatic.locations]).toEqual(["Dubai", "Copenhagen", "Kuwait", "Qatar"]);
    expect(DEFAULT_PLATFORM_SETTINGS.general.primaryLocations).toEqual([
      "Dubai",
      "Copenhagen",
      "Kuwait",
      "Qatar",
    ]);
  });

  it("highlights EASA Certified Instructors and 13 ATPL Subjects", () => {
    expect(INSTRUCTORS.title).toBe("EASA Certified Instructors");
    expect(ATPL_SUBJECTS_13).toHaveLength(13);
    expect(ATPL_SUBJECTS_13.some((s) => s.code === "090")).toBe(true);
    expect(ATPL_LIVE_TRAINING.body).toMatch(/Recordings are not available to students/i);
    expect(ATPL_LIVE_TRAINING.body).toMatch(/quality assurance/i);
  });

  it("adds the Pilot100 teaching-platform FAQ", () => {
    const faq = ATPL_FAQS.find((item) => /Which platform will you teach me from/i.test(item.q));
    expect(faq?.a).toMatch(/Pilot100 ATPL Question Bank/);
    expect(faq?.a).toMatch(/exclusive discount/);
  });

  it("renames the ATPL Course nav to Online Courses and drops Private Session", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Online Courses",
      "About",
      "Instructors",
      "Contact",
    ]);
    expect(NAV_ITEMS.some((item) => /private session/i.test(item.label))).toBe(false);
    expect(NAV_ITEMS[0]?.href).toBe(routes.onlineCourses);
    expect(ONLINE_COURSE_PROGRAMMES.map((p) => p.title)).toEqual([
      "ATPL Course",
      "Basics of Aviation",
      "ELP Mock Exams Live",
      "Private Pilot License",
    ]);
  });
});
