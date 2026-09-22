/**
 * Landing Enrol price and href must match public checkout for the same country.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { getJourneyEnrollMarketing } from "@/lib/marketing/journey-enroll-marketing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { quotePublicCheckout } from "@/services/payments/purchase-first-service";
import { formatMinor } from "@/services/payments/money";

beforeAll(() => {
  ensurePaymentsSeeded();
});

describe("checkout country sync", () => {
  it("shows KWD on Basics and points Enrol at checkout?country=KW", () => {
    const marketing = getJourneyEnrollMarketing("BASICS-RECORDED", "KW");
    expect(marketing.priceLabel).toMatch(/KWD/);
    expect(marketing.priceLabel).toContain("120.000");
    expect(marketing.enrollHref).toContain("country=KW");
    expect(marketing.enrollHref).toContain("productId=");
  });

  it("does not keep showing KWD when the shopper is in the UAE", () => {
    const marketing = getJourneyEnrollMarketing("BASICS-RECORDED", "AE");
    expect(marketing.priceLabel).toMatch(/AED/);
    expect(marketing.priceLabel).not.toMatch(/KWD/);
    expect(marketing.enrollHref).toContain("country=AE");
  });

  it("matches Basics landing labels to the public checkout quote", async () => {
    for (const country of ["KW", "AE", "SA"] as const) {
      const marketing = getJourneyEnrollMarketing("BASICS-RECORDED", country);
      const quote = await quotePublicCheckout({
        productId: marketing.enrollHref.match(/productId=([^&]+)/)?.[1],
        country,
      });
      expect(quote.detectedCountry).toBe(country);
      expect(marketing.priceLabel).toBe(formatMinor(quote.subtotalAmount, quote.currency));
    }
  });

  it("keeps ATPL Enrol on the same country as the displayed price", () => {
    const kw = getAtplProgramMarketing("KW");
    expect(kw.priceLabel).toMatch(/KWD/);
    expect(kw.enrollHref).toContain("country=KW");
    const ae = getAtplProgramMarketing("AE");
    expect(ae.priceLabel).toMatch(/AED/);
    expect(ae.enrollHref).toContain("country=AE");
  });

  it("does not send a Gulf locale-only shopper to the UAE", async () => {
    const quote = await quotePublicCheckout({
      locale: "ar-AE,ar;q=0.9",
    });
    expect(quote.detectedCountry).toBe("KW");
    expect(quote.currency).toBe("KWD");
    expect(quote.detectionSource).toBe("fallback");
  });
});
