/**
 * Country-first checkout pricing.
 * Currency and amount come from the billing country — never from a shared KWD catalog.
 * Tamara only sees AED/SAR. Taly only sees KWD.
 */

import { currencyForCountry } from "@/services/payments/currency-detection";
import { PaymentError } from "@/services/payments/access";
import { majorToMinor, minorToMajor } from "@/services/payments/money";
import type { CatalogProduct, PaymentMethodBrand } from "@/types/payments";

export const TAMARA_LIVE_COUNTRIES = ["AE", "SA"] as const;
export const TALY_LIVE_COUNTRIES = ["KW"] as const;
export const TAMARA_LIVE_CURRENCIES = ["AED", "SAR"] as const;
export const TALY_LIVE_CURRENCIES = ["KWD"] as const;

export type CheckoutMethodId = Extract<
  PaymentMethodBrand,
  "card" | "apple_pay" | "google_pay" | "tamara" | "taly"
>;

export type CountryCheckoutPlan = {
  country: string;
  currency: string;
  methods: CheckoutMethodId[];
  gateways: Array<"stripe" | "tamara" | "taly">;
};

/** Published ATPL package amounts (minor units). */
export const ATPL_PACKAGE_PRICES = {
  AED: majorToMinor(5760, "AED"),
  SAR: majorToMinor(5850, "SAR"),
  KWD: majorToMinor(480, "KWD"),
  USD: majorToMinor(1570, "USD"),
} as const;

export const ATPL_PACKAGE_COMPARE_AT = {
  AED: majorToMinor(6720, "AED"),
  SAR: majorToMinor(6825, "SAR"),
  KWD: majorToMinor(560, "KWD"),
  USD: majorToMinor(1830, "USD"),
} as const;

type AtplCurrency = keyof typeof ATPL_PACKAGE_PRICES;

export function atplPriceForCurrency(currency: string): number {
  return ATPL_PACKAGE_PRICES[currency as AtplCurrency] ?? ATPL_PACKAGE_PRICES.KWD;
}

export function atplCompareForCurrency(currency: string): number {
  return ATPL_PACKAGE_COMPARE_AT[currency as AtplCurrency] ?? ATPL_PACKAGE_COMPARE_AT.KWD;
}

const STRIPE_WALLETS: CheckoutMethodId[] = ["card", "apple_pay", "google_pay"];

export function checkoutPlanForCountry(
  countryCode: string | null | undefined,
): CountryCheckoutPlan {
  const country = (countryCode || "").toUpperCase();
  if (country === "AE") {
    return {
      country,
      currency: "AED",
      methods: [...STRIPE_WALLETS, "tamara"],
      gateways: ["stripe", "tamara"],
    };
  }
  if (country === "SA") {
    return {
      country,
      currency: "SAR",
      methods: [...STRIPE_WALLETS, "tamara"],
      gateways: ["stripe", "tamara"],
    };
  }
  if (country === "KW") {
    return {
      country,
      currency: "KWD",
      methods: [...STRIPE_WALLETS, "taly"],
      gateways: ["stripe", "taly"],
    };
  }
  return {
    country: country || "US",
    currency: currencyForCountry(country || "US"),
    methods: [...STRIPE_WALLETS],
    gateways: ["stripe"],
  };
}

export function pricesByCurrencyOf(
  product: Pick<CatalogProduct, "priceAmount" | "currency" | "pricesByCurrency" | "isFree">,
): Record<string, number> {
  if (product.isFree) return { ...(product.pricesByCurrency ?? {}), [product.currency]: 0 };
  return {
    [product.currency.toUpperCase()]: product.priceAmount,
    ...(product.pricesByCurrency ?? {}),
  };
}

function isAtplPackage(
  product: Pick<CatalogProduct, "name"> & { metadata?: { sku?: unknown } },
): boolean {
  return product.metadata?.sku === "ATPL-PACKAGE" || /ATPL/i.test(product.name);
}

export function resolveCountryPrice(
  product: Pick<
    CatalogProduct,
    "priceAmount" | "currency" | "pricesByCurrency" | "isFree" | "name" | "metadata"
  >,
  countryCode: string | null | undefined,
): { currency: string; amount: number; country: string } {
  const plan = checkoutPlanForCountry(countryCode);
  if (product.isFree) {
    return { currency: plan.currency, amount: 0, country: plan.country };
  }
  const table: Record<string, number> = {
    ...deriveListedPrices(product.priceAmount, product.currency),
    ...(isAtplPackage(product) ? ATPL_PACKAGE_PRICES : {}),
    ...pricesByCurrencyOf(product),
  };
  if (typeof table[plan.currency] === "number") {
    return { currency: plan.currency, amount: table[plan.currency]!, country: plan.country };
  }
  if (typeof table.USD === "number") {
    return { currency: "USD", amount: table.USD, country: plan.country };
  }
  throw new PaymentError(
    `${product.name} has no ${plan.currency} price for ${plan.country}. Add pricesByCurrency.${plan.currency}.`,
    422,
  );
}

export function assertBnplCurrency(
  gateway: "tamara" | "taly",
  country: string,
  currency: string,
): void {
  const plan = checkoutPlanForCountry(country);
  const code = currency.toUpperCase();
  if (gateway === "tamara") {
    if (
      !plan.gateways.includes("tamara") ||
      !(TAMARA_LIVE_CURRENCIES as readonly string[]).includes(code)
    ) {
      throw new PaymentError(
        `Tamara cannot charge ${code} in ${plan.country}. Use AED (UAE) or SAR (Saudi Arabia).`,
        400,
      );
    }
    return;
  }
  if (
    !plan.gateways.includes("taly") ||
    !(TALY_LIVE_CURRENCIES as readonly string[]).includes(code)
  ) {
    throw new PaymentError(
      `Taly cannot charge ${code} in ${plan.country}. Use KWD in Kuwait.`,
      400,
    );
  }
}

export function deriveListedPrices(
  baseAmount: number,
  baseCurrency: string,
): Record<string, number> {
  const code = baseCurrency.toUpperCase();
  if (code === "KWD" && baseAmount === ATPL_PACKAGE_PRICES.KWD) {
    return { ...ATPL_PACKAGE_PRICES };
  }
  const major = minorToMajor(baseAmount, code);
  const kwdMajor =
    code === "KWD"
      ? major
      : code === "AED"
        ? major / 12
        : code === "SAR"
          ? major / 12.1875
          : major / 3.270833;
  return {
    KWD: majorToMinor(kwdMajor, "KWD"),
    AED: majorToMinor(kwdMajor * 12, "AED"),
    SAR: majorToMinor(kwdMajor * 12.1875, "SAR"),
    USD: majorToMinor(kwdMajor * 3.270833, "USD"),
    [code]: baseAmount,
  };
}
