import { beforeAll, describe, expect, it } from "vitest";

import { suggestCourseCode } from "@/features/courses/lib/course-studio";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, toUserProfile } from "@/services/auth/store";
import {
  atplPackagePricesMajor,
  getAtplPackageProduct,
  updateAtplPackagePrices,
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
    expect(suggestCourseCode("Private Pilot License — Live Online")).toMatch(
      /^[A-Z0-9][A-Z0-9._-]*$/,
    );
    expect(suggestCourseCode("Meteorology")).toBe("METEOROLOGY");
  });

  it("saves ATPL package amounts and uses them for country checkout", () => {
    const admin = toUserProfile(findUserByEmail("superadmin@aviatorpass.com")!);
    const original = atplPackagePricesMajor(getAtplPackageProduct());
    const updated = updateAtplPackagePrices(admin, {
      KWD: 500,
      AED: 6000,
      SAR: 6100,
      USD: 1600,
      EUR: 6200,
    });
    const majors = atplPackagePricesMajor(updated);
    expect(majors.KWD).toBe(500);
    expect(updated.pricesByCurrency?.KWD).toBe(majorToMinor(500, "KWD"));

    const product = getAtplPackageProduct();
    expect(product).toBeTruthy();
    expect(resolveCountryPrice(product!, "KW")).toMatchObject({
      currency: "KWD",
      amount: majorToMinor(500, "KWD"),
    });
    expect(resolveCountryPrice(product!, "AE")).toMatchObject({
      currency: "AED",
      amount: majorToMinor(6000, "AED"),
    });
    updateAtplPackagePrices(admin, original);
  });
});
