/**
 * Stripe Product / Price IDs are not used. AviatorPass courses own pricing.
 * These helpers remain so older imports compile; they never call Stripe catalog APIs.
 */

import { PaymentError } from "@/services/payments/access";
import type { SupportedCheckoutCurrency } from "@/config/stripe-catalog";

export type ResolvedStripePrice = {
  currency: SupportedCheckoutCurrency;
  unitAmount: number;
  stripePriceId: string;
  stripeProductId: string | null;
  productName: string;
};

export function clearStripeCatalogCache(): void {
  /* no-op — catalog prices live on AviatorPass courses */
}

export async function resolveStripePrice(
  _unused: SupportedCheckoutCurrency,
): Promise<ResolvedStripePrice> {
  void _unused;
  throw new PaymentError(
    "Stripe Price IDs are not used. Checkout is created from the AviatorPass course with price_data.",
    400,
  );
}

export async function tryResolveStripePrice(
  _unused: SupportedCheckoutCurrency,
): Promise<ResolvedStripePrice | null> {
  void _unused;
  return null;
}
