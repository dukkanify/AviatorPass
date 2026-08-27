/**
 * Stripe catalog contract for ATPL PASS.
 * Amounts never live here — they come from Stripe Prices (Dashboard or sync script).
 */

export const STRIPE_ATPL_PRODUCT_NAME = "ATPL PASS";

/** ISO currencies with a dedicated Stripe Price. Fallback is always USD. */
export const SUPPORTED_CHECKOUT_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "AED",
  "SAR",
  "KWD",
  "BHD",
  "QAR",
  "OMR",
  "EGP",
  "JOD",
  "CAD",
  "AUD",
  "NZD",
  "SGD",
  "MYR",
  "JPY",
  "INR",
  "TRY",
  "ZAR",
] as const;

export type SupportedCheckoutCurrency = (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number];

export const DEFAULT_CHECKOUT_CURRENCY: SupportedCheckoutCurrency = "USD";

/** Eurozone + EUR-using territories — not every EU member (DK/SE/PL keep national currencies). */
export const EUROZONE_COUNTRIES = [
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "AD",
  "MC",
  "SM",
  "VA",
  "ME",
  "XK",
] as const;

/**
 * ISO 3166-1 alpha-2 → checkout currency.
 * Unlisted countries fall back to USD (never an application-side FX conversion).
 */
export const COUNTRY_CURRENCY: Record<string, SupportedCheckoutCurrency> = {
  US: "USD",
  PR: "USD",
  GU: "USD",
  VI: "USD",
  AS: "USD",
  MP: "USD",
  GB: "GBP",
  UK: "GBP",
  IM: "GBP",
  JE: "GBP",
  GG: "GBP",
  AE: "AED",
  SA: "SAR",
  KW: "KWD",
  BH: "BHD",
  QA: "QAR",
  OM: "OMR",
  EG: "EGP",
  JO: "JOD",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  SG: "SGD",
  MY: "MYR",
  JP: "JPY",
  IN: "INR",
  TR: "TRY",
  ZA: "ZAR",
  ...Object.fromEntries(EUROZONE_COUNTRIES.map((code) => [code, "EUR" as const])),
};

export function isSupportedCheckoutCurrency(value: string): value is SupportedCheckoutCurrency {
  return (SUPPORTED_CHECKOUT_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function envPriceKey(currency: SupportedCheckoutCurrency): string {
  return `STRIPE_PRICE_${currency}`;
}
