/**
 * Resolve ATPL Program enrollment URL and pricing for marketing pages.
 */

import { routes } from "@/constants/routes";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { listProducts } from "@/services/payments/catalog-service";
import { resolveCountryPrice } from "@/services/payments/country-pricing";
import {
  checkoutEnrollHref,
  PLATFORM_CHECKOUT_COUNTRY,
} from "@/services/payments/currency-detection";
import { formatMinor } from "@/services/payments/money";

export type AtplProgramMarketing = {
  landingHref: string;
  enrollHref: string;
  priceLabel: string | null;
  country: string;
};

export function getAtplProgramMarketing(country?: string | null): AtplProgramMarketing {
  const resolved = country?.trim() ? country : PLATFORM_CHECKOUT_COUNTRY;
  try {
    ensurePaymentsSeeded();
    const product =
      listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === "ATPL-PACKAGE") ?? null;
    if (product) {
      const priced = resolveCountryPrice(product, resolved);
      return {
        landingHref: routes.atpl,
        enrollHref: checkoutEnrollHref(product.id, priced.country),
        priceLabel: formatMinor(priced.amount, priced.currency),
        country: priced.country,
      };
    }
  } catch (error) {
    console.error("[atpl-program-marketing]", error);
  }
  return {
    landingHref: routes.atpl,
    enrollHref: `${routes.checkout}?country=${encodeURIComponent(resolved.toUpperCase())}`,
    priceLabel: null,
    country: resolved.toUpperCase(),
  };
}
