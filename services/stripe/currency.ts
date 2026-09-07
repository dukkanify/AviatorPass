/**
 * Checkout currencies — AviatorPass is the source of truth.
 * Any ISO 4217 code on a course is accepted so future currencies
 * work without a code change. AED, USD, KWD, and SAR are first-class.
 */

import { PaymentError } from "@/services/payments/access";
import { STRIPE_CHECKOUT_CURRENCIES } from "@/services/stripe/types";

const ISO_4217 = /^[A-Z]{3}$/;

export function stripeCheckoutCurrencies(): readonly string[] {
  return STRIPE_CHECKOUT_CURRENCIES;
}

export function isIso4217Currency(value: string): boolean {
  return ISO_4217.test(value.trim().toUpperCase());
}

/** True for any valid ISO 4217 code, including currencies added later. */
export function isStripeCheckoutCurrency(value: string): boolean {
  return isIso4217Currency(value);
}

export function normalizeCheckoutCurrency(raw: string | null | undefined): string {
  const upper = (raw ?? "").trim().toUpperCase();
  if (!isIso4217Currency(upper)) {
    throw new PaymentError(
      "Currency must be a 3-letter ISO 4217 code (e.g. AED, USD, KWD, SAR)",
      422,
    );
  }
  return upper;
}
