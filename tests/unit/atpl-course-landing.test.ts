import { describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import { NAV_ITEMS } from "@/constants/navigation";
import { HERO } from "@/features/marketing/content/atpl-pass-home";
import {
  ATPL_FAQS,
  ATPL_LANDING_HERO,
  COURSE_OVERVIEW,
  PRICING,
} from "@/features/marketing/content/atpl-course-landing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";

describe("ATPL course landing conversion path", () => {
  it("keeps purchase-first FAQs and CMS-driven subject copy", () => {
    expect(ATPL_FAQS.some((item) => /account before/i.test(item.q))).toBe(true);
    expect(ATPL_FAQS.some((item) => /Which platform will you teach me from/i.test(item.q))).toBe(
      true,
    );
    expect(ATPL_FAQS.some((item) => /Are all ATPL Subjects included/i.test(item.q))).toBe(true);
    expect(ATPL_LANDING_HERO.primaryCta).toBe("Enrol in Aviator Pass");
    expect(PRICING.cta).toBe("Enrol in Aviator Pass");
    expect(ATPL_LANDING_HERO.secondaryCta).toBe("See the ATPL Subjects");
    expect(COURSE_OVERVIEW.stats.map((s) => s.label)).toEqual([
      "ATPL Subjects",
      "Instruction only",
    ]);
    expect(
      COURSE_OVERVIEW.stats.some((s) => /Unified enrolment|Stripe checkout/i.test(s.label)),
    ).toBe(false);
  });

  it("sends Home to Online Courses and the landing Enrol CTA to checkout", () => {
    expect(HERO.primaryCta).toBe("Explore Online Courses");
    expect(NAV_ITEMS[0]?.href).toBe(routes.onlineCourses);
    expect(NAV_ITEMS[0]?.label).toBe("Online Courses");
    expect(NAV_ITEMS[0]?.children?.some((child) => child.href === routes.atpl)).toBe(true);
    expect(
      NAV_ITEMS[0]?.children?.map((child) => [child.label, child.hint ?? "", child.href]),
    ).toEqual([
      ["ATPL Course", "Airline Transport Pilot License · Live", routes.atpl],
      [
        "Basics of Aviation",
        "Introduction to aviation · Recorded",
        `${routes.onlineCoursesBasics}?mode=recorded`,
      ],
      [
        "Basics of Aviation",
        "Introduction to aviation · Live one-to-one",
        `${routes.onlineCoursesBasics}?mode=live`,
      ],
      ["ELP Mock Exams Live", "English Language Proficiency · Live", routes.onlineCoursesElp],
      [
        "Private Pilot License",
        "PPL ground school · Recorded",
        `${routes.onlineCoursesPpl}?mode=recorded`,
      ],
      [
        "Private Pilot License",
        "PPL ground school · Live one-to-one",
        `${routes.onlineCoursesPpl}?mode=live`,
      ],
    ]);
    const marketing = getAtplProgramMarketing();
    expect(marketing.landingHref).toBe("/atpl");
    expect(marketing.enrollHref.startsWith("/checkout")).toBe(true);
    expect(marketing.enrollHref).not.toContain("/register");
  });
});
