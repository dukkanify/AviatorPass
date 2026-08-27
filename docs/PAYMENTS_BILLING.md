# Payments, Billing, Invoices & Instructor Wallets (Task 012)

Enterprise financial infrastructure for AviatorPass.

## Scope

- Gateway adapters: **mock** (default) + **Stripe Checkout**-ready
- Pricing models: one-time, monthly/annual subscriptions, premium, packages, free, coupons
- Secure checkout (tokenized methods only — never stores PAN)
- Orders, invoices (HTML/PDF print), subscriptions
- Instructor wallets, earnings ledger, payout workflow
- Refunds (full/partial) with clawback
- Finance dashboard + CSV exports
- Webhook endpoint with signature validation

**Not included:** AI assistant, mobile apps.

## Architecture notes (Connect-ready)

Platform collects payments centrally; instructor share is credited to internal wallets after platform fee. Stripe mode uses Checkout Sessions with dynamic payment methods (Apple Pay / Google Pay / cards configured in Dashboard). Move to Stripe Connect destination charges when live connected accounts are provisioned.

## Runtime

- JSON: `.data/aep-payments.json`
- SQL: `database/migrations/011_payments_billing.sql`
- Flags: `features.payments`, `features.wallet` enabled
- Env (optional): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Services

| Service           | Path                                                |
| ----------------- | --------------------------------------------------- |
| Gateway           | `services/payments/gateway.ts`                      |
| Catalog / coupons | `services/payments/catalog-service.ts`              |
| Checkout / orders | `services/payments/checkout-service.ts`             |
| Invoices          | `services/payments/invoice-service.ts`              |
| Wallet            | `services/payments/wallet-service.ts`               |
| Payouts           | `services/payments/payout-service.ts`               |
| Refunds           | `services/payments/refund-service.ts`               |
| Reports           | `services/payments/report-service.ts`               |
| Regional rules    | `services/payments/regional-rules-service.ts`       |
| Installments      | `services/payments/installment-service.ts`          |
| KYC (passport)    | `services/payments/kyc-document-service.ts`         |
| Due reminders     | `services/payments/installment-reminder-service.ts` |

## API

| Path                                 | Purpose                                         |
| ------------------------------------ | ----------------------------------------------- |
| `/api/public/checkout`               | Guest purchase-first quote + mock pay (no auth) |
| `/api/public/checkout/session`       | Start Stripe Checkout Session (geo currency)    |
| `/api/public/checkout/welcome`       | Post-pay `/welcome` snapshot by session id      |
| `/api/public/checkout/invoice`       | Printable invoice after Stripe payment          |
| `/api/payments/catalog`              | Products, coupons, settings                     |
| `/api/payments/orders`               | Checkout, pay, retry, cancel, ledger            |
| `/api/payments/invoices`             | List / printable HTML                           |
| `/api/payments/wallet`               | Wallet, transactions, payouts                   |
| `/api/payments/refunds`              | Request / review                                |
| `/api/payments/reports`              | Dashboard + CSV                                 |
| `/api/payments/webhooks`             | Provider webhooks                               |
| `/api/payments/regional-rules`       | Country BNPL / installment eligibility          |
| `/api/payments/installments`         | Plans, schedule, suspend/resume                 |
| `/api/payments/installments/process` | Cron: overdue + reminder emails                 |
| `/api/payments/kyc`                  | Passport upload / verification                  |

## CR003 — Installments & regional payment rules (ATPL package)

Sourced from the **ATPL Theory Package** (`metadata.sku: ATPL-PACKAGE`).

| Region         | Modes                                    |
| -------------- | ---------------------------------------- |
| KW, SA, AE, BH | Full, Installments, Tamara, Tabby (تالي) |
| QA, OM         | Full, Installments                       |
| Other          | Full only                                |

Checkout requires **passport upload** + **agreement acceptance** for installments/BNPL. Schedule items carry **due dates**; reminder emails/in-app fire on configured offsets; overdue plans can **auto-suspend** package course access and **resume** after payment.

SQL: `database/migrations/020_installments_regional_payments.sql`

## Purchase-first ATPL enrolment

Marketing CTAs (`Enrol in ATPL PASS`) open public `/checkout`.

When `STRIPE_SECRET_KEY` is set, `/checkout` **immediately redirects to Stripe-hosted Checkout** (no account, no local card form). Stripe collects full name, email, billing address, country, and optional phone. Dynamic payment methods (Apple Pay, Google Pay, cards, Link, local methods) are configured in the Stripe Dashboard — the API never sends `payment_method_types`.

Currency is detected from billing country, CDN geo (`x-vercel-ip-country` / `cf-ipcountry`), then `Accept-Language`. Mapped catalogs: USD, GBP, EUR, AED, SAR, KWD, BHD, QAR, OMR, EGP, JOD, CAD, AUD, NZD, SGD, MYR, JPY, INR, TRY, ZAR. Unknown country → **USD**. Amounts always come from Stripe Prices (`STRIPE_PRODUCT_ID` / `STRIPE_PRICE_*` or listed Prices on the ATPL PASS Product). The app never converts FX.

On **`checkout.session.completed`** (signature verified, idempotent by event id) AviatorPass:

1. Creates a student (or attaches the order to an existing email — no duplicate users)
2. Emails a one-time **password setup link** (`/setup-password`) plus login URL and support contact
3. Enrolls ATPL package courses, creates order / invoice / notification / audit log
4. Redirects the browser to **`/welcome?session_id=…`**

Failed charges create **no** user and reserve **no** seat. OTP `/register` remains for free accounts. Logged-in `/student/checkout` is unchanged. Without Stripe keys the mock guest form stays available for local tests.

### Stripe webhooks

`POST /api/payments/webhooks` verifies `Stripe-Signature` and handles:

- `checkout.session.completed`
- `payment_intent.succeeded` / `payment_intent.payment_failed`
- `charge.refunded`
- `invoice.paid` / `invoice.payment_failed`
- `customer.subscription.created` / `updated` / `deleted`

Configure the endpoint in Stripe Dashboard → Developers → Webhooks. Sync catalog: `npm run stripe:sync` (requires operator-supplied `STRIPE_UNIT_AMOUNT_<CCY>` integers — never computed).

## Permissions

- `billing.own` — students
- `wallet.own` / `earnings.own` — instructors
- `system.payments`, `finance.reports`, `finance.wallets` — admin / super-admin

## Security

- No raw card storage (PCI-aware)
- Idempotent checkout keys
- Duplicate one-time purchase guard
- Webhook signature validation
- Activity logging for financial actions
- Paid package enrollment bypasses public enrollment windows
