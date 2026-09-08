/**
 * Automatic payment gateway routing by billing country.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentError } from "@/services/payments/access";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  allowedCheckoutModes,
  allowedGatewaysForCountry,
  assertPaymentMethodAllowedForCountry,
  getRegionalPaymentRule,
  isPaymentMethodAllowedForCountry,
} from "@/services/payments/regional-rules-service";
import {
  listGuestCheckoutMethods,
  payGuestCheckout,
  quoteGuestCheckout,
} from "@/services/payments/purchase-first-service";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.TAMARA_API_TOKEN = "test-tamara-api-token";
  process.env.TAMARA_BASE_URL = "https://api-sandbox.tamara.co";
  process.env.TALY_API_KEY = "test-taly-api-key";
  process.env.TALY_SECRET_KEY = "test-taly-secret-key";
  delete process.env.STRIPE_SECRET_KEY;
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("country gateway routing", () => {
  it("maps AE and SA to Stripe + Tamara, KW to Stripe + Taly, others Stripe only", () => {
    expect(allowedGatewaysForCountry("AE")).toEqual(["stripe", "tamara"]);
    expect(allowedGatewaysForCountry("SA")).toEqual(["stripe", "tamara"]);
    expect(allowedGatewaysForCountry("KW")).toEqual(["stripe", "taly"]);
    expect(allowedGatewaysForCountry("BH")).toEqual(["stripe"]);
    expect(allowedGatewaysForCountry("QA")).toEqual(["stripe"]);
    expect(allowedGatewaysForCountry("OM")).toEqual(["stripe"]);
    expect(allowedGatewaysForCountry("US")).toEqual(["stripe"]);
    expect(allowedGatewaysForCountry("GB")).toEqual(["stripe"]);
    expect(getRegionalPaymentRule("AE").bnplProviders).toEqual(["tamara"]);
    expect(getRegionalPaymentRule("SA").bnplProviders).toEqual(["tamara"]);
    expect(getRegionalPaymentRule("KW").bnplProviders).toEqual(["taly"]);
    expect(getRegionalPaymentRule("US").bnplProviders).toEqual([]);
    expect(allowedCheckoutModes(getRegionalPaymentRule("AE"))).toEqual(
      expect.arrayContaining(["full", "tamara"]),
    );
    expect(allowedCheckoutModes(getRegionalPaymentRule("KW"))).toEqual(
      expect.arrayContaining(["full", "taly"]),
    );
  });

  it("hides unsupported gateways on the public checkout quote", () => {
    const ae = quoteGuestCheckout(undefined, "AE").methods.map((m) => m.id);
    expect(ae).toContain("card");
    expect(ae).toContain("tamara");
    expect(ae).not.toContain("taly");
    expect(ae).not.toContain("tabby");

    const kw = quoteGuestCheckout(undefined, "KW").methods.map((m) => m.id);
    expect(kw).toContain("card");
    expect(kw).toContain("taly");
    expect(kw).not.toContain("tamara");

    const us = quoteGuestCheckout(undefined, "US").methods.map((m) => m.id);
    expect(us).toContain("card");
    expect(us).not.toContain("tamara");
    expect(us).not.toContain("taly");
    expect(us).not.toContain("tabby");

    expect(listGuestCheckoutMethods("SA").some((m) => m.id === "tamara" && m.available)).toBe(true);
    expect(listGuestCheckoutMethods("BH").some((m) => m.id === "tamara")).toBe(false);

    expect(quoteGuestCheckout(undefined, "AE").currency).toBe("AED");
    expect(quoteGuestCheckout(undefined, "SA").currency).toBe("SAR");
    expect(quoteGuestCheckout(undefined, "KW").currency).toBe("KWD");
    expect(quoteGuestCheckout(undefined, "US").currency).toBe("USD");
    expect(quoteGuestCheckout(undefined, "AE").currency).not.toBe("KWD");
  });

  it("allows Stripe brands everywhere and rejects the wrong BNPL country", () => {
    expect(isPaymentMethodAllowedForCountry("card", "US")).toBe(true);
    expect(isPaymentMethodAllowedForCountry("apple_pay", "KW")).toBe(true);
    expect(isPaymentMethodAllowedForCountry("tamara", "AE")).toBe(true);
    expect(isPaymentMethodAllowedForCountry("tamara", "SA")).toBe(true);
    expect(isPaymentMethodAllowedForCountry("tamara", "KW")).toBe(false);
    expect(isPaymentMethodAllowedForCountry("taly", "KW")).toBe(true);
    expect(isPaymentMethodAllowedForCountry("taly", "AE")).toBe(false);
    expect(isPaymentMethodAllowedForCountry("tabby", "KW")).toBe(false);
    expect(() =>
      assertPaymentMethodAllowedForCountry("taly", "AE", "United Arab Emirates"),
    ).toThrow(PaymentError);
    expect(() => assertPaymentMethodAllowedForCountry("tamara", "KW", "Kuwait")).toThrow(
      PaymentError,
    );
  });

  it("blocks guest checkout when the gateway does not support the billing country", async () => {
    await expect(
      payGuestCheckout({
        firstName: "Noor",
        lastName: "Ali",
        email: `route.taly.ae.${Date.now()}@aviatorpass.test`,
        phone: "+971501111111",
        country: "AE",
        billingName: "Noor Ali",
        billingAddress: "Dubai",
        methodBrand: "taly",
        idempotencyKey: `route-taly-ae-${Date.now()}`,
      }),
    ).rejects.toMatchObject({
      name: "PaymentError",
      message: expect.stringMatching(/Taly is not available in United Arab Emirates/),
    });

    await expect(
      payGuestCheckout({
        firstName: "Sara",
        lastName: "Kuwait",
        email: `route.tamara.kw.${Date.now()}@aviatorpass.test`,
        phone: "+96550001111",
        country: "KW",
        billingName: "Sara Kuwait",
        billingAddress: "Salmiya",
        methodBrand: "tamara",
        idempotencyKey: `route-tamara-kw-${Date.now()}`,
      }),
    ).rejects.toMatchObject({
      name: "PaymentError",
      message: expect.stringMatching(/Tamara is not available in Kuwait/),
    });
  });
});
