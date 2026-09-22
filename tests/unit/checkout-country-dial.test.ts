import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyCountryDialCode,
  countryOptionLabel,
  dialCodeForCountry,
} from "@/constants/countries";

describe("checkout country calling codes", () => {
  it("looks up official dial codes and labels", () => {
    expect(dialCodeForCountry("KW")).toBe("+965");
    expect(dialCodeForCountry("ae")).toBe("+971");
    expect(dialCodeForCountry("SA")).toBe("+966");
    expect(dialCodeForCountry("OTHER")).toBeNull();
    expect(countryOptionLabel({ name: "Kuwait", dialCode: "+965" })).toBe("Kuwait (+965)");
    expect(countryOptionLabel({ name: "Other" })).toBe("Other");
  });

  it("fills and replaces the calling code when the country changes", () => {
    expect(applyCountryDialCode("", "+965")).toBe("+965");
    expect(applyCountryDialCode("+965", "+971", "+965")).toBe("+971");
    expect(applyCountryDialCode("+96550001111", "+971", "+965")).toBe("+97150001111");
    expect(applyCountryDialCode("50001111", "+965")).toBe("+96550001111");
    expect(applyCountryDialCode("050001111", "+965")).toBe("+96550001111");
  });

  it("shows country codes on the guest checkout country list", () => {
    const checkoutView = readFileSync(
      path.join(process.cwd(), "features/payments/components/guest-checkout-view.tsx"),
      "utf8",
    );
    expect(checkoutView).toContain("countryOptionLabel");
    expect(checkoutView).toContain("applyCountryDialCode");
    expect(checkoutView).toContain("withCountryDial");
    expect(checkoutView).toContain(
      "Prices, currency, and instalment options follow the selected country",
    );
  });
});
