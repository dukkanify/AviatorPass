/**
 * Currency detection for global Stripe Checkout.
 */

import { describe, expect, it } from "vitest";

import {
  countryFromLocale,
  currencyForCountry,
  detectCheckoutCurrency,
  detectCheckoutCurrencyFromHeaders,
  normalizeCountryCode,
} from "@/services/payments/currency-detection";
import { DEFAULT_CHECKOUT_CURRENCY, SUPPORTED_CHECKOUT_CURRENCIES } from "@/config/stripe-catalog";

describe("checkout currency detection", () => {
  it("maps the operator-specified countries to catalog currencies", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("UK")).toBe("GBP");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("AE")).toBe("AED");
    expect(currencyForCountry("SA")).toBe("SAR");
    expect(currencyForCountry("KW")).toBe("KWD");
    expect(currencyForCountry("BH")).toBe("BHD");
    expect(currencyForCountry("QA")).toBe("QAR");
    expect(currencyForCountry("OM")).toBe("OMR");
    expect(currencyForCountry("EG")).toBe("EGP");
    expect(currencyForCountry("JO")).toBe("JOD");
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("AU")).toBe("AUD");
    expect(currencyForCountry("NZ")).toBe("NZD");
    expect(currencyForCountry("SG")).toBe("SGD");
    expect(currencyForCountry("MY")).toBe("MYR");
    expect(currencyForCountry("JP")).toBe("JPY");
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("TR")).toBe("TRY");
    expect(currencyForCountry("ZA")).toBe("ZAR");
  });

  it("falls back to USD for unmapped countries and KWD when country is empty", () => {
    expect(currencyForCountry("NG")).toBe(DEFAULT_CHECKOUT_CURRENCY);
    expect(currencyForCountry(null)).toBe("KWD");
    expect(normalizeCountryCode("XX")).toBeNull();
  });

  it("reads region from browser locale", () => {
    expect(countryFromLocale("en-GB")).toBe("GB");
    expect(countryFromLocale("ar-AE,ar;q=0.9")).toBe("AE");
    expect(countryFromLocale("fr")).toBeNull();
  });

  it("does not treat Gulf language packs as location", () => {
    expect(detectCheckoutCurrency({ locale: "ar-AE,ar;q=0.9,en;q=0.8" })).toEqual({
      country: "KW",
      currency: "KWD",
      source: "fallback",
    });
    expect(detectCheckoutCurrency({ locale: "en-GB" })).toEqual({
      country: "GB",
      currency: "GBP",
      source: "locale",
    });
  });

  it("prefers geo IP over a Gulf locale, and cookie over geo", () => {
    expect(detectCheckoutCurrency({ geoCountry: "AE", locale: "ar-KW" })).toEqual({
      country: "AE",
      currency: "AED",
      source: "geo",
    });
    expect(
      detectCheckoutCurrency({
        cookieCountry: "KW",
        geoCountry: "AE",
        locale: "ar-AE",
      }),
    ).toEqual({ country: "KW", currency: "KWD", source: "cookie" });
  });

  it("prefers billing country over geo and locale", () => {
    const detected = detectCheckoutCurrency({
      billingCountry: "GB",
      geoCountry: "US",
      locale: "en-KW",
    });
    expect(detected).toEqual({ country: "GB", currency: "GBP", source: "billing" });
  });

  it("uses Vercel/Cloudflare geo headers", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "JP",
      "accept-language": "en-US",
    });
    const detected = detectCheckoutCurrencyFromHeaders(headers);
    expect(detected.currency).toBe("JPY");
    expect(detected.source).toBe("geo");
  });

  it("lists every supported checkout currency", () => {
    expect(SUPPORTED_CHECKOUT_CURRENCIES).toContain("KWD");
    expect(SUPPORTED_CHECKOUT_CURRENCIES).toHaveLength(20);
  });
});
