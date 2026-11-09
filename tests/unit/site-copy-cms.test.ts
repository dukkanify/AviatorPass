import { afterEach, describe, expect, it } from "vitest";

import { HERO } from "@/features/marketing/content/atpl-pass-home";
import {
  getHomeSiteCopy,
  listSiteCopySnapshots,
  resetFieldCopy,
  resetPageCopy,
  resolvePageCopy,
  updatePageCopy,
} from "@/services/marketing/site-copy-service";
import { resetSiteCopyDbForTests } from "@/services/marketing/site-copy-store";

afterEach(() => {
  resetSiteCopyDbForTests();
});

describe("site copy CMS", () => {
  it("resolves code defaults when no overrides exist", () => {
    const copy = resolvePageCopy("home");
    expect(copy["hero.headline"]).toBe(HERO.headline);
    expect(copy["hero.kicker"]).toBe(HERO.kicker);
    expect(getHomeSiteCopy().hero.headline).toBe(HERO.headline);
  });

  it("merges overrides over defaults and ignores empty strings", () => {
    updatePageCopy("home", {
      "hero.headline": "Train with Aviator Pass today",
      "hero.kicker": "   ",
    });
    const copy = resolvePageCopy("home");
    expect(copy["hero.headline"]).toBe("Train with Aviator Pass today");
    expect(copy["hero.kicker"]).toBe(HERO.kicker);
  });

  it("treats value equal to default as not overridden", () => {
    updatePageCopy("home", { "hero.headline": HERO.headline });
    const snap = listSiteCopySnapshots().find((p) => p.id === "home");
    const headline = snap?.fields.find((f) => f.key === "hero.headline");
    expect(headline?.overridden).toBe(false);
  });

  it("resets a single field and a whole page", () => {
    updatePageCopy("home", {
      "hero.headline": "Custom headline",
      "hero.primaryCta": "Custom CTA",
    });
    resetFieldCopy("home", "hero.headline");
    expect(resolvePageCopy("home")["hero.headline"]).toBe(HERO.headline);
    expect(resolvePageCopy("home")["hero.primaryCta"]).toBe("Custom CTA");

    resetPageCopy("home");
    expect(resolvePageCopy("home")["hero.primaryCta"]).toBe(HERO.primaryCta);
  });

  it("lists all marketing pages with field snapshots", () => {
    const pages = listSiteCopySnapshots();
    expect(pages.map((p) => p.id)).toEqual([
      "home",
      "atpl",
      "online-courses",
      "online-courses-basics",
      "online-courses-ppl",
      "online-courses-elp",
      "flightpath",
      "live",
      "contact",
    ]);
    expect(pages.every((p) => p.fields.length > 0)).toBe(true);
  });
});
