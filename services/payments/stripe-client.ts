/**
 * Stripe SDK singleton — instance methods only, never a global api_key.
 * Implementation lives in services/stripe.
 */

export {
  STRIPE_API_VERSION,
  getStripeClient,
  isStripeConfigured,
  isStripeWebhookConfigured,
  stripeCheckoutLive,
  requireStripeSecretKey as getStripeSecretKey,
} from "@/services/stripe/client";
