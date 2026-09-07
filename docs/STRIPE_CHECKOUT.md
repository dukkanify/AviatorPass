# Stripe Checkout — AviatorPass production

Hosted Stripe Checkout for Aviator Pass. Secret keys stay in environment variables and never reach the browser.

Runtime store: `.data/aep-stripe.json`  
SQL: `database/migrations/032_stripe_checkouts.sql`

## Endpoints

| Method | Path                                    | Auth        | Purpose                                 |
| ------ | --------------------------------------- | ----------- | --------------------------------------- |
| POST   | `/api/payments/create-checkout-session` | CSRF        | Create a Stripe-hosted Checkout Session |
| POST   | `/api/payments/webhook`                 | Stripe HMAC | Verify signature, update payment, enrol |
| GET    | `/api/payments/session?session_id=cs_…` | Public      | Safe session status (no secrets)        |

Legacy alias: `POST /api/payments/webhooks` (same handler).

Production webhook URL:

`https://www.aviatorpass.com/api/payments/webhook`

Success / cancel URLs:

- `https://www.aviatorpass.com/payment/success?session_id={CHECKOUT_SESSION_ID}`
- `https://www.aviatorpass.com/payment/cancel?session_id={CHECKOUT_SESSION_ID}`

## Environment

Never commit values. Set in Vercel Production / `.env.local` only.

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRODUCT_ID=
STRIPE_PRICE_USD=
STRIPE_PRICE_AED=
STRIPE_PRICE_KWD=
STRIPE_PRICE_SAR=
```

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. The publishable key is the only Stripe value allowed in the browser.

## Payment statuses

Stored on `stripe_checkouts.status`:

| Status     | Meaning                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| `pending`  | Checkout created; enrolment stays pending                                |
| `paid`     | Payment succeeded; student is enrolled; email + in-app notification sent |
| `failed`   | Payment failed; enrolment remains pending; student is notified           |
| `refunded` | Charge refunded                                                          |

## Metadata sent to Stripe

`courseId`, `studentId`, `instructorId`, `currency`, `amount` (plus `orderId` when an AviatorPass order exists).

## Currencies

First-class on `POST /api/payments/create-checkout-session`: **AED, USD, KWD, SAR**.  
Existing ATPL catalog Prices may still use additional ISO currencies on the public `/checkout` flow.

Amounts are integer minor units (fils for KWD, cents for USD/AED/SAR).

## Subscriptions and instructor payouts

Checkout `mode` accepts `payment` (default) or `subscription`. Recurring Prices are required for subscription mode.

Instructor payouts: `instructorId` is stored on the session and PaymentIntent (`transfer_group`). Stripe Connect `transfer_data` / destination charges can be added later without changing this metadata contract.

## Webhook events

Signature verified with `STRIPE_WEBHOOK_SECRET` (`Stripe-Signature` header). Handled types include:

- `checkout.session.completed`
- `payment_intent.succeeded` / `payment_intent.payment_failed`
- `charge.refunded`
- `invoice.paid` / `invoice.payment_failed`
- `customer.subscription.*`
