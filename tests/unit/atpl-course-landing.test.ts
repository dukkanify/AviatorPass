import { describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import { NAV_ITEMS } from "@/constants/navigation";
import { HERO } from "@/features/marketing/content/atpl-pass-home";
import {
  ATPL_FAQS,
  ATPL_LANDING_HERO,
  ATPL_SUBJECTS_13,
  PRICING,
} from "@/features/marketing/content/atpl-course-landing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";

describe("ATPL course landing conversion path", () => {
  it("keeps thirteen ATPL subjects and purchase-first FAQs", () => {
    expect(ATPL_SUBJECTS_13).toHaveLength(13);
    expect(ATPL_FAQS.some((item) => /account before/i.test(item.q))).toBe(true);
    expect(ATPL_FAQS.some((item) => /Which platform will you teach me from/i.test(item.q))).toBe(
      true,
    );
    expect(ATPL_LANDING_HERO.primaryCta).toBe("Enrol in Aviator Pass");
    expect(PRICING.cta).toBe("Enrol in Aviator Pass");
  });

  it("sends Home to Online Courses and the landing Enrol CTA to checkout", () => {
    expect(HERO.primaryCta).toBe("Explore Online Courses");
    expect(NAV_ITEMS[0]?.href).toBe(routes.onlineCourses);
    expect(NAV_ITEMS[0]?.label).toBe("Online Courses");
    expect(NAV_ITEMS[0]?.children?.some((child) => child.href === routes.atpl)).toBe(true);
    const marketing = getAtplProgramMarketing();
    expect(marketing.landingHref).toBe("/atpl");
    expect(marketing.enrollHref.startsWith("/checkout")).toBe(true);
    expect(marketing.enrollHref).not.toContain("/register");
  });
});
