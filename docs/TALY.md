# Taly checkout — AviatorPass

Hosted Taly checkout sits beside Stripe and Tamara. AviatorPass still owns courses, prices, currency, enrolment, invoices, and notifications. Taly only processes the payment.

Taly is **not** Tabby (تالي). Official docs: [https://docs.taly.io](https://docs.taly.io).

Stripe remains unchanged: `POST /api/payments/webhook` and `POST /api/payments/create-checkout-session`. Tamara remains unchanged: `POST /api/payments/tamara/webhook`.

## Endpoints

| Method | Path                                                   | Auth          | Purpose                                                 |
| ------ | ------------------------------------------------------ | ------------- | ------------------------------------------------------- |
| POST   | `/api/public/checkout` with `methodBrand: "taly"`      | Public + CSRF | Guest Taly hosted checkout and redirect                 |
| POST   | `/api/payments/taly/create-order`                      | CSRF          | Create Taly order (guest fields or signed-in `orderId`) |
| POST   | `/api/payments/orders` `action=pay` `paymentMode=taly` | Signed-in     | Authenticated Taly checkout                             |
| POST   | `/api/payments/taly/webhook`                           | Taly HMAC     | Verify, update payment, enrol                           |
| GET    | `/api/payments/session?session_id=<orderId\|token>`    | Public        | Safe status for Taly return URLs                        |

Production webhook URL:

`https://www.aviatorpass.com/api/payments/taly/webhook`

Success / cancel URLs:

- `https://www.aviatorpass.com/payment/success?session_id=<orderId>`
- `https://www.aviatorpass.com/payment/cancel?session_id=<orderId>`

Taly uses a single `merchantRedirectUrl` (success). Status on return (`Confirmed` / `Cancel` / `Rejected`) is informational. The webhook is the source of truth.

## Environment

Never commit values. Set in Vercel Production / `.env.local` only.

```
TALY_API_KEY=
TALY_SECRET_KEY=
TALY_WEBHOOK_SECRET=
TALY_BASE_URL=
```

| Variable              | Sandbox                     | Production                 |
| --------------------- | --------------------------- | -------------------------- |
| `TALY_API_KEY`        | Merchant API username       | Live merchant API username |
| `TALY_SECRET_KEY`     | Merchant API password       | Live merchant API password |
| `TALY_WEBHOOK_SECRET` | HMAC secret from onboarding | Live webhook HMAC secret   |
| `TALY_BASE_URL`       | `https://api.dev-taly.io`   | `https://api.taly.io`      |

If `TALY_BASE_URL` is omitted, AviatorPass uses sandbox unless `NEXT_PUBLIC_APP_ENV` or `VERCEL_ENV` is `production`.

Every Taly API call authenticates with the merchant **API Key** and **Secret Key**: password-grant login (`POST /uaa/oauth/token`) then `Authorization: Bearer` plus `X-Api-Key` / `X-Api-Secret` on subsequent requests. Access tokens are cached until shortly before expiry (~24h). Tokens and keys are never logged.

Taly is shown on checkout whenever `TALY_API_KEY` and `TALY_SECRET_KEY` are set. Currencies follow the AviatorPass course / order (all existing catalog currencies). Amounts are converted from integer minor units to Taly major units.

## Checkout flow

1. Student chooses **Taly** (shown with the Taly mark next to Stripe and Tamara).
2. AviatorPass creates a pending order and calls `POST {TALY_BASE_URL}/accounts/payment/v2/initiate`.
3. The student is redirected to `secureCheckoutUrl`.
4. Taly returns to `/payment/success`.
5. `POST /api/payments/taly/webhook` is the source of truth for activation.

## Webhook events

Signature: `Taly-Signature` header = HMAC-SHA256 hex of concatenated payload values, using `TALY_WEBHOOK_SECRET`. Missing or invalid signatures are rejected. Duplicate IDs (`{orderToken}:{orderStatus}:{orderDate}`) are ignored. Payloads are stored on the payment record.

| Taly status           | Internal payment     | Order                                                                             |
| --------------------- | -------------------- | --------------------------------------------------------------------------------- |
| Approved / CONFIRMED  | Paid / succeeded     | Paid — enrolment, invoice, confirmation email, in-app notification, audit         |
| Pending / INITIATED   | Pending / processing | Pending (no second fulfilment if already paid)                                    |
| Failed / REJECTED     | Failed               | Failed — enrolment stays pending, student notified                                |
| Cancelled / CANCELLED | Failed               | Cancelled                                                                         |
| Refunded / REFUNDED   | Refunded             | Refunded — history updated; access revoked only if `revokeAccessOnRefund` is true |

On **Approved**, AviatorPass looks up the Taly order (`GET /accounts/merchant/orders?merchantOrderId=…`) when credentials are present, then fulfils the same way Stripe and Tamara do.

## Refunds and status lookup

- Portal refunds at Taly send a `REFUNDED` webhook; AviatorPass records the refund.
- Admin-approved refunds call `POST /accounts/payment/refund/{orderToken}` with merchant credentials.
- Cancel pending checkouts with `POST /accounts/payment/cancel/{orderToken}` (confirmed orders cannot be cancelled this way).
- Status lookup: `GET /accounts/merchant/orders?merchantOrderId={id}`.

## Testing steps

1. Set `TALY_API_KEY`, `TALY_SECRET_KEY`, `TALY_WEBHOOK_SECRET`, and `TALY_BASE_URL=https://api.dev-taly.io`.
2. Open `/checkout`, select Taly, submit. Confirm the API returns `secureCheckoutUrl` and the browser redirects to Taly.
3. POST a signed `CONFIRMED` payload to `/api/payments/taly/webhook`. Confirm enrolment, invoice, email outbox, and in-app notification.
4. Replay the same event ID — response `duplicate: true`, no second enrolment.
5. POST `REJECTED` — payment failed, no account/enrolment.
6. POST `REFUNDED` — payment history shows refunded.
7. Card/Stripe checkout still creates a Stripe session (`cs_…`) and still uses `/api/payments/webhook`. Tamara still uses `/api/payments/tamara/webhook`.

Unit coverage: `tests/unit/taly-checkout.test.ts`, `tests/unit/taly-webhooks.test.ts`. Stripe and Tamara tests stay green.

## Partner portal

Register `postBackUrl` (sent on initiate) as:

`https://www.aviatorpass.com/api/payments/taly/webhook`

Allow inbound requests from Taly to that path. Copy the webhook HMAC secret from onboarding email into `TALY_WEBHOOK_SECRET`. Confirm sandbox vs live `TALY_BASE_URL` before going live.
