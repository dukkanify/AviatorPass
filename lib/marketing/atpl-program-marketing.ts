/**
 * Resolve ATPL Program enrollment URL and pricing for marketing pages.
 */

import {
  ATPL_PACKAGE_SKU_FULL,
  ATPL_PACKAGE_TIERS,
  type AtplPackageSku,
} from "@/constants/atpl-complete-package";
import { routes } from "@/constants/routes";
import { listProducts } from "@/services/payments/catalog-service";
import { resolveCountryPrice } from "@/services/payments/country-pricing";
import {
  checkoutEnrollHref,
  PLATFORM_CHECKOUT_COUNTRY,
} from "@/services/payments/currency-detection";
import { formatMinor } from "@/services/payments/money";
import { ensureAtplPackageAndRegionalRules } from "@/services/payments/seed";

export type AtplProgramMarketing = {
  landingHref: string;
  enrollHref: string;
  priceLabel: string | null;
  country: string;
};

export type AtplPackageTierMarketing = {
  sku: AtplPackageSku;
  title: string;
  subjectCount: number;
  subjectLabel: string;
  cta: string;
  featured: boolean;
  enrollHref: string;
  priceLabel: string | null;
};

export function getAtplProgramMarketing(country?: string | null): AtplProgramMarketing {
  const resolved = country?.trim() ? country : PLATFORM_CHECKOUT_COUNTRY;
  try {
    ensureAtplPackageAndRegionalRules();
    const product =
      listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === ATPL_PACKAGE_SKU_FULL) ??
      null;
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

export function getAtplPackageTierMarketing(country?: string | null): AtplPackageTierMarketing[] {
  const base = getAtplProgramMarketing(country);
  try {
    ensureAtplPackageAndRegionalRules();
    const products = listProducts({ activeOnly: true });
    return ATPL_PACKAGE_TIERS.map((tier) => {
      const product = products.find((row) => row.metadata?.sku === tier.sku);
      if (!product) {
        return {
          sku: tier.sku,
          title: tier.title,
          subjectCount: tier.subjectCount,
          subjectLabel: tier.subjectLabel,
          cta: tier.cta,
          featured: tier.featured,
          enrollHref: base.enrollHref,
          priceLabel: tier.sku === ATPL_PACKAGE_SKU_FULL ? base.priceLabel : null,
        };
      }
      const priced = resolveCountryPrice(product, base.country);
      return {
        sku: tier.sku,
        title: tier.title,
        subjectCount: tier.subjectCount,
        subjectLabel: tier.subjectLabel,
        cta: tier.cta,
        featured: tier.featured,
        enrollHref: checkoutEnrollHref(product.id, priced.country),
        priceLabel: formatMinor(priced.amount, priced.currency),
      };
    });
  } catch (error) {
    console.error("[atpl-package-tiers-marketing]", error);
    return ATPL_PACKAGE_TIERS.map((tier) => ({
      sku: tier.sku,
      title: tier.title,
      subjectCount: tier.subjectCount,
      subjectLabel: tier.subjectLabel,
      cta: tier.cta,
      featured: tier.featured,
      enrollHref: base.enrollHref,
      priceLabel: tier.sku === ATPL_PACKAGE_SKU_FULL ? base.priceLabel : null,
    }));
  }
}
