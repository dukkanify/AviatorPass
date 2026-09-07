/**
 * Stripe Checkout configuration — env only. Never hardcode secrets.
 */

import { PRODUCTION_SITE_URL, publicAppOrigin } from "@/lib/site-origin";
import { routes } from "@/constants/routes";
import { STRIPE_CHECKOUT_CURRENCIES, type StripeCheckoutCurrency } from "@/services/stripe/types";

export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

export const STRIPE_WEBHOOK_PATH = "/api/payments/webhook";
export const STRIPE_WEBHOOK_URL = `${PRODUCTION_SITE_URL}${STRIPE_WEBHOOK_PATH}`;

export function stripeCheckoutCurrencies(): readonly StripeCheckoutCurrency[] {
  return STRIPE_CHECKOUT_CURRENCIES;
}

export function isStripeCheckoutCurrency(value: string): value is StripeCheckoutCurrency {
  return (STRIPE_CHECKOUT_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function stripeSuccessUrl(origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentSuccess}?session_id={CHECKOUT_SESSION_ID}`;
}

export function stripeCancelUrl(origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentCancel}?session_id={CHECKOUT_SESSION_ID}`;
}

export function getStripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

export function isStripeSecretConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function isStripeWebhookSecretConfigured(): boolean {
  return Boolean(getStripeWebhookSecret());
}
