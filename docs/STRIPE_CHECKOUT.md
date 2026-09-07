# Stripe Checkout — AviatorPass source of truth

Hosted Stripe Checkout. AviatorPass owns courses, prices, currency, enrolment, invoices, and notifications. Stripe only processes the payment.

Runtime store: `.data/aep-stripe.json`  
SQL: `database/migrations/032_stripe_checkouts.sql`, `database/migrations/033_stripe_dynamic_payments.sql`

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
```

Do **not** set `STRIPE_PRODUCT_ID` or `STRIPE_PRICE_*`. Checkout uses `price_data` generated from the AviatorPass course.

## How Checkout is created

Admin creates a course (title, description, price, currency, instructor, image, publish).  
Enrol Now → `POST /api/payments/create-checkout-session` with `courseId`.  
Backend loads the course and creates a Stripe Session with:

- `price_data.currency`
- `price_data.unit_amount`
- `product_data.name`
- `product_data.description`

No Stripe Dashboard Products or Prices.

## Metadata sent to Stripe

`courseId`, `studentId`, `instructorId`, `courseSlug`, `currency`, `amount`, `platform=AviatorPass`.

## Payment statuses

| Status     | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `pending`  | Checkout created; enrolment stays pending                              |
| `paid`     | Payment succeeded; student enrolled; invoice + email + notification    |
| `failed`   | Payment failed; no access; student notified                            |
| `refunded` | Charge refunded; access revoked only if `revokeAccessOnRefund` is true |

Duplicate webhooks are ignored via Stripe Event ID (`processedProviderEvents`).

## Currencies

Read from the course. First-class: **AED, USD, KWD, SAR**. Any other ISO 4217 code works without a code change.

Amounts are integer minor units (fils for KWD, cents for USD/AED/SAR).

## Webhook events

Signature verified with `STRIPE_WEBHOOK_SECRET` (`Stripe-Signature` header). Handled types:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `charge.refunded`

All other event types are acknowledged and ignored.
