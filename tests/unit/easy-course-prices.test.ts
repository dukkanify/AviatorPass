import { beforeAll, describe, expect, it } from "vitest";

import { suggestCourseCode } from "@/features/courses/lib/course-studio";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, toUserProfile } from "@/services/auth/store";
import {
  getAtplProductBySku,
  listAtplTierPricesMajor,
  updateAtplPackagePrices,
  updateAtplTierPrices,
} from "@/services/payments/catalog-service";
import { resolveCountryPrice } from "@/services/payments/country-pricing";
import { majorToMinor } from "@/services/payments/money";
import { ensurePaymentsSeeded } from "@/services/payments/seed";

describe("easy course prices", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensurePaymentsSeeded();
  });

  it("builds a valid course code from the title", () => {
    expect(suggestCourseCode("Private Pilot License, Live Online")).toMatch(
      /^[A-Z0-9][A-Z0-9._-]*$/,
    );
    expect(suggestCourseCode("Meteorology")).toBe("METEOROLOGY");
  });

  it("saves independent ATPL tier amounts and uses them for country checkout", () => {
    const admin = toUserProfile(findUserByEmail("superadmin@aviatorpass.com")!);
    const original = listAtplTierPricesMajor();
    const originalMap = Object.fromEntries(
      original.map((tier) => [tier.sku, tier.prices]),
    ) as Record<string, Record<string, number>>;

    updateAtplTierPrices(admin, {
      "ATPL-SINGLE": { KWD: 40, AED: 480, SAR: 490, USD: 130, EUR: 500 },
      "ATPL-5": { KWD: 190, AED: 2300, SAR: 2350, USD: 620, EUR: 2400 },
      "ATPL-PACKAGE": { KWD: 500, AED: 6000, SAR: 6100, USD: 1600, EUR: 6200 },
    });

    const single = getAtplProductBySku("ATPL-SINGLE");
    const five = getAtplProductBySku("ATPL-5");
    const full = getAtplProductBySku("ATPL-PACKAGE");
    expect(single).toBeTruthy();
    expect(five).toBeTruthy();
    expect(full).toBeTruthy();
    expect(resolveCountryPrice(single!, "KW")).toMatchObject({
      currency: "KWD",
      amount: majorToMinor(40, "KWD"),
    });
    expect(resolveCountryPrice(five!, "KW")).toMatchObject({
      currency: "KWD",
      amount: majorToMinor(190, "KWD"),
    });
    expect(resolveCountryPrice(full!, "KW")).toMatchObject({
      currency: "KWD",
      amount: majorToMinor(500, "KWD"),
    });
    expect(resolveCountryPrice(full!, "AE")).toMatchObject({
      currency: "AED",
      amount: majorToMinor(6000, "AED"),
    });

    // Legacy single-package helper still updates the full package.
    updateAtplPackagePrices(admin, originalMap["ATPL-PACKAGE"]!);
    updateAtplTierPrices(admin, {
      "ATPL-SINGLE": originalMap["ATPL-SINGLE"]!,
      "ATPL-5": originalMap["ATPL-5"]!,
      "ATPL-PACKAGE": originalMap["ATPL-PACKAGE"]!,
    });
  });
});
