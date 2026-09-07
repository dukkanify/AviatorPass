/**
 * Stripe Checkout domain types.
 * Lifecycle statuses are the contract stored in the database.
 * Secrets never appear on these types.
 */

export const STRIPE_LIFECYCLE_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type StripeLifecycleStatus = (typeof STRIPE_LIFECYCLE_STATUSES)[number];

export const STRIPE_CHECKOUT_CURRENCIES = ["AED", "USD", "KWD", "SAR"] as const;
export type StripeCheckoutCurrency = (typeof STRIPE_CHECKOUT_CURRENCIES)[number];

export const STRIPE_CHECKOUT_MODES = ["payment", "subscription", "setup"] as const;
export type StripeCheckoutMode = (typeof STRIPE_CHECKOUT_MODES)[number];

export interface StripeCheckoutMetadata {
  courseId: string;
  studentId: string;
  instructorId: string;
  currency: string;
  amount: string;
  orderId?: string;
  paymentId?: string;
  checkoutId?: string;
}

export interface StripeCheckoutRecord {
  id: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  /** Reserved for Billing / subscriptions. */
  stripeSubscriptionId: string | null;
  /** Reserved for Connect instructor payouts. */
  stripeConnectAccountId: string | null;
  mode: StripeCheckoutMode;
  status: StripeLifecycleStatus;
  courseId: string;
  studentId: string;
  instructorId: string;
  currency: string;
  amount: number;
  enrollmentId: string | null;
  orderId: string | null;
  paymentId: string | null;
  checkoutUrl: string | null;
  successUrl: string;
  cancelUrl: string;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

export interface CreateCheckoutSessionInput {
  courseId: string;
  studentId?: string | null;
  instructorId?: string | null;
  currency: string;
  amount?: number | null;
  email?: string | null;
  customerName?: string | null;
  country?: string | null;
  locale?: string | null;
  mode?: StripeCheckoutMode;
  idempotencyKey?: string | null;
}

export interface PublicCheckoutSession {
  sessionId: string;
  status: StripeLifecycleStatus;
  paymentStatus: string;
  courseId: string;
  studentId: string;
  instructorId: string;
  currency: string;
  amount: number;
  paid: boolean;
  enrollmentPending: boolean;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeWebhookProcessResult {
  eventId: string;
  type: string;
  duplicate: boolean;
  handled: boolean;
  status: string;
  checkoutId: string | null;
  paymentId: string | null;
  orderId: string | null;
}
