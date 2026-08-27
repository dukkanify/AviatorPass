/**
 * Resolve Stripe Product / Price IDs. Amounts always come from Stripe — never FX math.
 */

import {
  DEFAULT_CHECKOUT_CURRENCY,
  STRIPE_ATPL_PRODUCT_NAME,
  SUPPORTED_CHECKOUT_CURRENCIES,
  envPriceKey,
  type SupportedCheckoutCurrency,
} from "@/config/stripe-catalog";
import { PaymentError } from "@/services/payments/access";
import { getStripeClient, isStripeConfigured } from "@/services/payments/stripe-client";
import { coerceCheckoutCurrency } from "@/services/payments/currency-detection";

export type ResolvedStripePrice = {
  currency: SupportedCheckoutCurrency;
  unitAmount: number;
  stripePriceId: string;
  stripeProductId: string | null;
  productName: string;
};

type PriceCache = {
  at: number;
  productId: string | null;
  byCurrency: Map<string, ResolvedStripePrice>;
};

const CACHE_TTL_MS = 5 * 60_000;
let cache: PriceCache | null = null;

function envOverridePriceId(currency: SupportedCheckoutCurrency): string | null {
  const id = process.env[envPriceKey(currency)]?.trim();
  return id || null;
}

function envProductId(): string | null {
  return process.env.STRIPE_PRODUCT_ID?.trim() || null;
}

export function clearStripeCatalogCache(): void {
  cache = null;
}

async function loadStripePrices(): Promise<PriceCache> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;

  const stripe = getStripeClient();
  const byCurrency = new Map<string, ResolvedStripePrice>();
  let productId = envProductId();

  if (productId) {
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
    });
    for (const price of prices.data) {
      if (price.type !== "one_time") continue;
      if (price.unit_amount == null) continue;
      const currency = coerceCheckoutCurrency(price.currency);
      if (price.currency.toUpperCase() !== currency) continue;
      byCurrency.set(currency, {
        currency,
        unitAmount: price.unit_amount,
        stripePriceId: price.id,
        stripeProductId: typeof price.product === "string" ? price.product : productId,
        productName: STRIPE_ATPL_PRODUCT_NAME,
      });
    }
  } else {
    const products = await stripe.products.list({ active: true, limit: 100 });
    const atpl = products.data.find(
      (p) =>
        p.name.trim().toUpperCase() === STRIPE_ATPL_PRODUCT_NAME ||
        p.metadata?.sku === "ATPL-PACKAGE",
    );
    if (atpl) {
      productId = atpl.id;
      const prices = await stripe.prices.list({ product: atpl.id, active: true, limit: 100 });
      for (const price of prices.data) {
        if (price.type !== "one_time" || price.unit_amount == null) continue;
        const currency = coerceCheckoutCurrency(price.currency);
        if (price.currency.toUpperCase() !== currency) continue;
        byCurrency.set(currency, {
          currency,
          unitAmount: price.unit_amount,
          stripePriceId: price.id,
          stripeProductId: atpl.id,
          productName: atpl.name || STRIPE_ATPL_PRODUCT_NAME,
        });
      }
    }
  }

  for (const currency of SUPPORTED_CHECKOUT_CURRENCIES) {
    const override = envOverridePriceId(currency);
    if (!override) continue;
    const existing = byCurrency.get(currency);
    if (existing && existing.stripePriceId === override) continue;
    const price = await stripe.prices.retrieve(override);
    if (price.unit_amount == null) continue;
    byCurrency.set(currency, {
      currency,
      unitAmount: price.unit_amount,
      stripePriceId: price.id,
      stripeProductId: typeof price.product === "string" ? price.product : productId,
      productName: STRIPE_ATPL_PRODUCT_NAME,
    });
  }

  cache = { at: now, productId, byCurrency };
  return cache;
}

export async function resolveStripePrice(
  currency: SupportedCheckoutCurrency,
): Promise<ResolvedStripePrice> {
  if (!isStripeConfigured()) {
    throw new PaymentError("Stripe is not configured", 503);
  }

  const loaded = await loadStripePrices();
  const match = loaded.byCurrency.get(currency) ?? loaded.byCurrency.get(DEFAULT_CHECKOUT_CURRENCY);
  if (!match) {
    throw new PaymentError(
      `No Stripe Price is configured for ${currency} or ${DEFAULT_CHECKOUT_CURRENCY}. Set STRIPE_PRODUCT_ID / STRIPE_PRICE_* or run npm run stripe:sync.`,
      503,
    );
  }
  return match;
}

export async function tryResolveStripePrice(
  currency: SupportedCheckoutCurrency,
): Promise<ResolvedStripePrice | null> {
  if (!isStripeConfigured()) return null;
  try {
    return await resolveStripePrice(currency);
  } catch {
    return null;
  }
}
