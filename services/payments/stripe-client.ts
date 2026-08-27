/**
 * Stripe SDK singleton — instance methods only, never a global api_key.
 */

import Stripe from "stripe";

import { PaymentError } from "@/services/payments/access";

/** Latest Stripe API version. Cast keeps older SDK type unions compiling. */
export const STRIPE_API_VERSION = "2026-07-29.dahlia" as Stripe.LatestApiVersion;

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key);
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new PaymentError("Stripe is not configured", 503);
  }
  return key;
}

export function getStripeClient(): Stripe {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: {
      name: "AviatorPass",
      url: process.env.NEXT_PUBLIC_APP_URL,
    },
  });
}

export function stripeCheckoutLive(): boolean {
  return isStripeConfigured();
}
