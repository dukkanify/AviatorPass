/**
 * Stripe SDK client — instance methods only. Secret keys stay on the server.
 */

import Stripe from "stripe";

import { getBaseUrl } from "@/lib/site-origin";
import { PaymentError } from "@/services/payments/access";
import {
  STRIPE_API_VERSION,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeSecretConfigured,
  isStripeWebhookSecretConfigured,
} from "@/services/stripe/config";

export { STRIPE_API_VERSION };

export function isStripeConfigured(): boolean {
  return isStripeSecretConfigured();
}

export function isStripeWebhookConfigured(): boolean {
  return isStripeWebhookSecretConfigured();
}

export function requireStripeSecretKey(): string {
  const key = getStripeSecretKey();
  if (!key) {
    throw new PaymentError("Stripe is not configured", 503);
  }
  return key;
}

export function getStripeClient(): Stripe {
  return new Stripe(requireStripeSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: {
      name: "AviatorPass",
      url: getBaseUrl(),
    },
  });
}

export function stripeCheckoutLive(): boolean {
  return isStripeConfigured();
}

export function constructStripeEvent(payload: string, signature: string | null): Stripe.Event {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    throw new PaymentError("Stripe webhook secret not configured", 503);
  }
  try {
    return Stripe.webhooks.constructEvent(payload, signature ?? "", secret);
  } catch {
    throw new PaymentError("Invalid Stripe webhook signature", 400);
  }
}
