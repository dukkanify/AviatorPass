/**
 * Public marketing pages must stay read-only after the catalog is seeded.
 * Rewriting aep-payments through Neon on every /atpl view was a 15s+ TTFB.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { getJourneyEnrollMarketing } from "@/lib/marketing/journey-enroll-marketing";
import { ensureCustomerJourneyProducts } from "@/services/journeys/customer-journey-catalog";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import * as paymentsStore from "@/services/payments/store";

describe("marketing page load stays read-only", () => {
  beforeAll(() => {
    ensurePaymentsSeeded();
  });

  it("does not seed payments from ATPL or journey marketing helpers", () => {
    const atpl = readFileSync(
      path.join(process.cwd(), "lib/marketing/atpl-program-marketing.ts"),
      "utf8",
    );
    const journey = readFileSync(
      path.join(process.cwd(), "lib/marketing/journey-enroll-marketing.ts"),
      "utf8",
    );
    const home = readFileSync(path.join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
    expect(atpl).not.toMatch(/ensurePaymentsSeeded/);
    expect(journey).not.toMatch(/ensurePaymentsSeeded/);
    expect(home).toMatch(/export const revalidate = 300/);
    expect(home).not.toMatch(/force-dynamic/);
  });

  it("skips payments writes when the catalog is already complete", () => {
    const spy = vi.spyOn(paymentsStore, "writePaymentsDb");
    ensurePaymentsSeeded();
    ensureCustomerJourneyProducts();
    const atpl = getAtplProgramMarketing("KW");
    const ppl = getJourneyEnrollMarketing("PPL-LIVE", "AE");
    expect(spy).not.toHaveBeenCalled();
    expect(atpl.enrollHref).toContain("/checkout");
    expect(atpl.priceLabel).toBeTruthy();
    expect(ppl.enrollHref).toContain("/checkout");
    spy.mockRestore();
  });
});
