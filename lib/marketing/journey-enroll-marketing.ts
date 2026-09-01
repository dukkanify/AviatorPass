/**
 * Resolve checkout hrefs for customer-journey SKUs without changing purchase-first ATPL.
 */

import { routes } from "@/constants/routes";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { listProducts } from "@/services/payments/catalog-service";
import { formatMinor } from "@/services/payments/money";
import type { JourneySku } from "@/services/journeys/customer-journey-catalog";

export type JourneyEnrollMarketing = {
  enrollHref: string;
  priceLabel: string | null;
  productName: string | null;
};

export function getJourneyEnrollMarketing(sku: JourneySku): JourneyEnrollMarketing {
  try {
    ensurePaymentsSeeded();
    const product = listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === sku) ?? null;
    if (product) {
      return {
        enrollHref: `${routes.checkout}?productId=${product.id}`,
        priceLabel: formatMinor(product.priceAmount, product.currency),
        productName: product.name,
      };
    }
  } catch (error) {
    console.error("[journey-enroll-marketing]", error);
  }
  return { enrollHref: routes.checkout, priceLabel: null, productName: null };
}
