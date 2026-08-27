import { describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import { NAV_ITEMS } from "@/constants/navigation";
import { HERO } from "@/features/marketing/content/atpl-pass-home";
import {
  ATPL_FAQS,
  ATPL_LANDING_HERO,
  ATPL_SUBJECTS_14,
  PRICING,
} from "@/features/marketing/content/atpl-course-landing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";

describe("ATPL course landing conversion path", () => {
  it("keeps fourteen ATPL subjects and purchase-first FAQs", () => {
    expect(ATPL_SUBJECTS_14).toHaveLength(14);
    expect(ATPL_FAQS.some((item) => /account before/i.test(item.q))).toBe(true);
    expect(ATPL_LANDING_HERO.primaryCta).toBe("Enrol in ATPL PASS");
    expect(PRICING.cta).toBe("Enrol in ATPL PASS");
  });

  it("sends Home to /atpl and the landing Enrol CTA to checkout", () => {
    expect(HERO.primaryCta).toBe("Enrol in ATPL PASS");
    expect(NAV_ITEMS[0]?.href).toBe(routes.atpl);
    const marketing = getAtplProgramMarketing();
    expect(marketing.landingHref).toBe("/atpl");
    expect(marketing.enrollHref.startsWith("/checkout")).toBe(true);
    expect(marketing.enrollHref).not.toContain("/register");
  });
});
