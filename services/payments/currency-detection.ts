/**
 * Intelligent checkout currency selection.
 * Never converts amounts — only picks an ISO currency for a Stripe Price lookup.
 */

import {
  COUNTRY_CURRENCY,
  DEFAULT_CHECKOUT_CURRENCY,
  isSupportedCheckoutCurrency,
  type SupportedCheckoutCurrency,
} from "@/config/stripe-catalog";

export type CurrencyDetectionSource = "billing" | "geo" | "locale" | "explicit" | "fallback";

export type CurrencyDetectionInput = {
  country?: string | null;
  billingCountry?: string | null;
  geoCountry?: string | null;
  locale?: string | null;
};

export type CurrencyDetection = {
  country: string | null;
  currency: SupportedCheckoutCurrency;
  source: CurrencyDetectionSource;
};

const COUNTRY_RE = /^[A-Z]{2}$/;

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (!raw || raw === "XX" || raw === "T1" || raw === "ZZ" || raw === "A1" || raw === "A2") {
    return null;
  }
  if (raw === "UK") return "GB";
  if (!COUNTRY_RE.test(raw)) return null;
  return raw;
}

/** Parse `Accept-Language` / `navigator.language` into a region country when present. */
export function countryFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const primary = locale.split(",")[0]?.trim();
  if (!primary) return null;
  const tag = primary.split(";")[0]?.trim();
  if (!tag) return null;
  const parts = tag.replace(/_/g, "-").split("-");
  if (parts.length < 2) return null;
  const region = parts.find((p, i) => i > 0 && COUNTRY_RE.test(p.toUpperCase()));
  return normalizeCountryCode(region ?? null);
}

export function currencyForCountry(country: string | null | undefined): SupportedCheckoutCurrency {
  const code = normalizeCountryCode(country);
  if (!code) return DEFAULT_CHECKOUT_CURRENCY;
  return COUNTRY_CURRENCY[code] ?? DEFAULT_CHECKOUT_CURRENCY;
}

export function detectCheckoutCurrency(input: CurrencyDetectionInput): CurrencyDetection {
  const billing = normalizeCountryCode(input.billingCountry);
  if (billing) {
    return { country: billing, currency: currencyForCountry(billing), source: "billing" };
  }

  const explicit = normalizeCountryCode(input.country);
  if (explicit) {
    return { country: explicit, currency: currencyForCountry(explicit), source: "explicit" };
  }

  const geo = normalizeCountryCode(input.geoCountry);
  if (geo) {
    return { country: geo, currency: currencyForCountry(geo), source: "geo" };
  }

  const fromLocale = countryFromLocale(input.locale);
  if (fromLocale) {
    return { country: fromLocale, currency: currencyForCountry(fromLocale), source: "locale" };
  }

  return { country: null, currency: DEFAULT_CHECKOUT_CURRENCY, source: "fallback" };
}

export function detectCheckoutCurrencyFromHeaders(
  headers: Headers,
  extras?: { country?: string | null; locale?: string | null },
): CurrencyDetection {
  const geo =
    headers.get("cf-ipcountry") ??
    headers.get("x-vercel-ip-country") ??
    headers.get("x-country-code") ??
    headers.get("cloudfront-viewer-country");
  const locale = extras?.locale ?? headers.get("accept-language");
  return detectCheckoutCurrency({
    country: extras?.country,
    geoCountry: geo,
    locale,
  });
}

export function coerceCheckoutCurrency(
  value: string | null | undefined,
): SupportedCheckoutCurrency {
  if (value && isSupportedCheckoutCurrency(value))
    return value.toUpperCase() as SupportedCheckoutCurrency;
  return DEFAULT_CHECKOUT_CURRENCY;
}
