/**
 * Country-first checkout pricing — Tamara never sees KWD, Taly never sees AED.
 */

import { afterEach, describe, expect, it } from "vitest";

import { PaymentError } from "@/services/payments/access";
import {
  ATPL_PACKAGE_PRICES,
  assertBnplCurrency,
  checkoutPlanForCountry,
  resolveCountryPrice,
} from "@/services/payments/country-pricing";
import type { CatalogProduct } from "@/types/payments";

const atpl = {
  name: "ATPL Theory Package",
  priceAmount: ATPL_PACKAGE_PRICES.KWD,
  currency: "KWD",
  isFree: false,
  metadata: { sku: "ATPL-PACKAGE" },
} satisfies Pick<CatalogProduct, "name" | "priceAmount" | "currency" | "isFree" | "metadata">;

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("country-first pricing", () => {
  it("quotes Stripe-only plans by default while keeping country currencies", () => {
    expect(checkoutPlanForCountry("AE")).toMatchObject({
      currency: "AED",
      gateways: ["stripe"],
    });
    expect(checkoutPlanForCountry("SA")).toMatchObject({
      currency: "SAR",
      gateways: ["stripe"],
    });
    expect(checkoutPlanForCountry("KW")).toMatchObject({
      currency: "KWD",
      gateways: ["stripe"],
    });
    expect(checkoutPlanForCountry("US")).toMatchObject({
      currency: "USD",
      gateways: ["stripe"],
    });
    expect(checkoutPlanForCountry("AE").methods).not.toContain("tamara");
    expect(checkoutPlanForCountry("KW").methods).not.toContain("taly");
  });

  it("routes AE/SA to Tamara and KW to Taly when third-party BNPL is enabled", () => {
    process.env.ENABLE_THIRD_PARTY_BNPL = "true";
    expect(checkoutPlanForCountry("AE")).toMatchObject({
      currency: "AED",
      gateways: ["stripe", "tamara"],
    });
    expect(checkoutPlanForCountry("SA")).toMatchObject({
      currency: "SAR",
      gateways: ["stripe", "tamara"],
    });
    expect(checkoutPlanForCountry("KW")).toMatchObject({
      currency: "KWD",
      gateways: ["stripe", "taly"],
    });
    expect(checkoutPlanForCountry("AE").methods).not.toContain("taly");
    expect(checkoutPlanForCountry("KW").methods).not.toContain("tamara");
    delete process.env.ENABLE_THIRD_PARTY_BNPL;
  });

  it("switches ATPL price with country and never quotes KWD for Tamara countries", () => {
    expect(resolveCountryPrice(atpl, "AE")).toEqual({
      country: "AE",
      currency: "AED",
      amount: ATPL_PACKAGE_PRICES.AED,
    });
    expect(resolveCountryPrice(atpl, "SA")).toEqual({
      country: "SA",
      currency: "SAR",
      amount: ATPL_PACKAGE_PRICES.SAR,
    });
    expect(resolveCountryPrice(atpl, "KW")).toEqual({
      country: "KW",
      currency: "KWD",
      amount: ATPL_PACKAGE_PRICES.KWD,
    });
    expect(resolveCountryPrice(atpl, "US")).toEqual({
      country: "US",
      currency: "USD",
      amount: ATPL_PACKAGE_PRICES.USD,
    });
    expect(resolveCountryPrice(atpl, "AE").currency).not.toBe("KWD");
    expect(resolveCountryPrice(atpl, "KW").currency).not.toBe("AED");
  });

  it("rejects unsupported BNPL country-currency pairs", () => {
    expect(() => assertBnplCurrency("tamara", "KW", "KWD")).toThrow(PaymentError);
    expect(() => assertBnplCurrency("tamara", "AE", "KWD")).toThrow(PaymentError);
    expect(() => assertBnplCurrency("taly", "AE", "AED")).toThrow(PaymentError);
    expect(() => assertBnplCurrency("taly", "KW", "AED")).toThrow(PaymentError);
    expect(() => assertBnplCurrency("tamara", "US", "USD")).toThrow(PaymentError);
    expect(() => assertBnplCurrency("tamara", "AE", "AED")).not.toThrow();
    expect(() => assertBnplCurrency("tamara", "SA", "SAR")).not.toThrow();
    expect(() => assertBnplCurrency("taly", "KW", "KWD")).not.toThrow();
  });
});
