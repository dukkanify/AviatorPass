/**
 * Intelligent checkout country / currency selection.
 * Geo IP is location. GCC language packs (ar-AE) are not location.
 */

import {
  COUNTRY_CURRENCY,
  DEFAULT_CHECKOUT_CURRENCY,
  isSupportedCheckoutCurrency,
  type SupportedCheckoutCurrency,
} from "@/config/stripe-catalog";
import { routes } from "@/constants/routes";

export type CurrencyDetectionSource =
  "billing" | "geo" | "locale" | "explicit" | "cookie" | "fallback";

export type CurrencyDetectionInput = {
  country?: string | null;
  billingCountry?: string | null;
  geoCountry?: string | null;
  locale?: string | null;
  cookieCountry?: string | null;
};

export type CurrencyDetection = {
  country: string;
  currency: SupportedCheckoutCurrency;
  source: CurrencyDetectionSource;
};

const COUNTRY_RE = /^[A-Z]{2}$/;

/** AviatorPass home market — used when location is unknown. */
export const PLATFORM_CHECKOUT_COUNTRY = "KW";

export const CHECKOUT_COUNTRY_COOKIE = "aep_checkout_country";
export const CHECKOUT_COUNTRY_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Phone / browser language packs sold across the Gulf. `ar-AE` on a Kuwait
 * device must not flip checkout to the United Arab Emirates.
 */
export const UNTRUSTED_LOCALE_REGIONS = new Set(["AE", "SA", "KW", "BH", "QA", "OM"]);

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

/** Locale region only when it is not a Gulf language-pack country. */
export function trustedCountryFromLocale(locale: string | null | undefined): string | null {
  const country = countryFromLocale(locale);
  if (!country || UNTRUSTED_LOCALE_REGIONS.has(country)) return null;
  return country;
}

export function currencyForCountry(country: string | null | undefined): SupportedCheckoutCurrency {
  const code = normalizeCountryCode(country);
  if (!code) return currencyForCountry(PLATFORM_CHECKOUT_COUNTRY);
  return COUNTRY_CURRENCY[code] ?? DEFAULT_CHECKOUT_CURRENCY;
}

export function readCheckoutCountryCookie(cookieHeader?: string | null): string | null {
  const raw = cookieHeader ?? (typeof document !== "undefined" ? document.cookie : "");
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${CHECKOUT_COUNTRY_COOKIE}=([A-Za-z]{2})`));
  return normalizeCountryCode(match?.[1] ?? null);
}

export function checkoutEnrollHref(productId: string, country?: string | null): string {
  const code = normalizeCountryCode(country) ?? PLATFORM_CHECKOUT_COUNTRY;
  return `${routes.checkout}?productId=${encodeURIComponent(productId)}&country=${code}`;
}

export function writeCheckoutCountryCookie(country: string): void {
  const code = normalizeCountryCode(country);
  if (!code || typeof document === "undefined") return;
  document.cookie = `${CHECKOUT_COUNTRY_COOKIE}=${code}; Path=/; Max-Age=${CHECKOUT_COUNTRY_MAX_AGE}; SameSite=Lax`;
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

  const cookie = normalizeCountryCode(input.cookieCountry);
  if (cookie) {
    return { country: cookie, currency: currencyForCountry(cookie), source: "cookie" };
  }

  const geo = normalizeCountryCode(input.geoCountry);
  if (geo) {
    return { country: geo, currency: currencyForCountry(geo), source: "geo" };
  }

  return {
    country: PLATFORM_CHECKOUT_COUNTRY,
    currency: currencyForCountry(PLATFORM_CHECKOUT_COUNTRY),
    source: "fallback",
  };
}

export function detectCheckoutCurrencyFromHeaders(
  headers: Headers,
  extras?: { country?: string | null; locale?: string | null; cookieCountry?: string | null },
): CurrencyDetection {
  const geo =
    headers.get("cf-ipcountry") ??
    headers.get("x-vercel-ip-country") ??
    headers.get("x-country-code") ??
    headers.get("cloudfront-viewer-country");
  const locale = extras?.locale ?? headers.get("accept-language");
  const cookieCountry = extras?.cookieCountry ?? readCheckoutCountryCookie(headers.get("cookie"));
  return detectCheckoutCurrency({
    country: extras?.country,
    geoCountry: geo,
    locale,
    cookieCountry,
  });
}

export function coerceCheckoutCurrency(
  value: string | null | undefined,
): SupportedCheckoutCurrency {
  if (value && isSupportedCheckoutCurrency(value))
    return value.toUpperCase() as SupportedCheckoutCurrency;
  return currencyForCountry(PLATFORM_CHECKOUT_COUNTRY);
}
