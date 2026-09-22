/**
 * Resolve checkout hrefs for customer-journey SKUs without changing purchase-first ATPL.
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
import type { JourneySku } from "@/services/journeys/customer-journey-catalog";

export type JourneyEnrollMarketing = {
  enrollHref: string;
  priceLabel: string | null;
  productName: string | null;
  country: string;
};

export function getJourneyEnrollMarketing(
  sku: JourneySku,
  country?: string | null,
): JourneyEnrollMarketing {
  const resolved = country?.trim() ? country : PLATFORM_CHECKOUT_COUNTRY;
  try {
    ensurePaymentsSeeded();
    const product = listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === sku) ?? null;
    if (product) {
      const priced = resolveCountryPrice(product, resolved);
      return {
        enrollHref: checkoutEnrollHref(product.id, priced.country),
        priceLabel: formatMinor(priced.amount, priced.currency),
        productName: product.name,
        country: priced.country,
      };
    }
  } catch (error) {
    console.error("[journey-enroll-marketing]", error);
  }
  return {
    enrollHref: `${routes.checkout}?country=${encodeURIComponent(resolved.toUpperCase())}`,
    priceLabel: null,
    productName: null,
    country: resolved.toUpperCase(),
  };
}
