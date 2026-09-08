# Tamara checkout — AviatorPass

Hosted Tamara checkout sits beside Stripe. AviatorPass still owns courses, prices, currency, enrolment, invoices, and notifications. Tamara only processes the payment.

Stripe remains unchanged: `POST /api/payments/webhook` and `POST /api/payments/create-checkout-session`.

## Endpoints

| Method | Path                                                     | Auth       | Purpose                                         |
| ------ | -------------------------------------------------------- | ---------- | ----------------------------------------------- |
| POST   | `/api/public/checkout` with `methodBrand: "tamara"`      | Public     | Create Tamara hosted checkout and redirect      |
| POST   | `/api/payments/orders` `action=pay` `paymentMode=tamara` | Signed-in  | Authenticated Tamara checkout                   |
| POST   | `/api/payments/tamara/webhook`                           | Tamara JWT | Verify (when configured), update payment, enrol |
| GET    | `/api/payments/session?session_id=<orderId>`             | Public     | Safe status for Tamara return URLs              |

Production webhook URL:

`https://www.aviatorpass.com/api/payments/tamara/webhook`

Success / cancel URLs:

- `https://www.aviatorpass.com/payment/success?session_id=<orderId>`
- `https://www.aviatorpass.com/payment/cancel?session_id=<orderId>`

## Environment

Never commit values. Set in Vercel Production / `.env.local` only.

```
TAMARA_API_TOKEN=
TAMARA_BASE_URL=
TAMARA_NOTIFICATION_TOKEN=
```

| Variable                    | Sandbox                              | Production              |
| --------------------------- | ------------------------------------ | ----------------------- |
| `TAMARA_API_TOKEN`          | Merchant API token from Tamara       | Live merchant API token |
| `TAMARA_BASE_URL`           | `https://api-sandbox.tamara.co`      | `https://api.tamara.co` |
| `TAMARA_NOTIFICATION_TOKEN` | HS256 secret from the partner portal | Same for live webhooks  |

If `TAMARA_BASE_URL` is omitted, AviatorPass uses sandbox unless `NEXT_PUBLIC_APP_ENV` or `VERCEL_ENV` is `production`.

`TAMARA_NOTIFICATION_TOKEN` is the webhook JWT secret, **not** the API token. Without it, local/test requests with no `tamaraToken` are logged as unverified. Production requests that include a `tamaraToken` are rejected until the notification token is set.

## Checkout flow

1. Student chooses **Tamara** (shown with the official logo next to Stripe).
2. AviatorPass creates a pending order and calls `POST {TAMARA_BASE_URL}/checkout`.
3. The student is redirected to Tamara hosted checkout.
4. Tamara returns to `/payment/success` or `/payment/cancel`.
5. The webhook is the source of truth for activation.

Tamara is available when `TAMARA_API_TOKEN` is set and the billing country is the United Arab Emirates or Saudi Arabia. Other countries hide Tamara automatically.

## Webhook events

Signature: JWT `tamaraToken` in `Authorization: Bearer` and/or the `tamaraToken` query parameter (HS256). Invalid signatures are rejected. Duplicate IDs (`{order_id}:{event_type}`) are ignored. Payloads are stored on the payment record.

| Tamara event                    | Internal payment     | Order                                                                             |
| ------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| Approved (`order_approved`)     | Paid / succeeded     | Paid — enrolment, invoice, email, notification, audit                             |
| Authorised (`order_authorised`) | Pending / processing | Pending (no second fulfilment if already paid)                                    |
| OnHold (`order_onhold`)         | Pending / processing | Pending                                                                           |
| Declined (`order_declined`)     | Failed               | Failed — enrolment stays pending, student notified                                |
| Cancelled (`order_canceled`)    | Failed               | Cancelled                                                                         |
| Refunded (`order_refunded`)     | Refunded             | Refunded — history updated; access revoked only if `revokeAccessOnRefund` is true |

On **Approved**, AviatorPass authorises (and captures) the Tamara order so it does not expire, then fulfils the same way Stripe does.

## Testing steps

1. Set `TAMARA_API_TOKEN` and `TAMARA_BASE_URL=https://api-sandbox.tamara.co`.
2. Open `/checkout`, choose country AE or SA, select Tamara, submit. Confirm the API returns `checkout_url` and the browser redirects to Tamara.
3. POST a signed `order_approved` payload to `/api/payments/tamara/webhook`. Confirm enrolment, invoice, email outbox, and in-app notification.
4. Replay the same event ID — response `duplicate: true`, no second enrolment.
5. POST `order_declined` — payment failed, no account/enrolment.
6. POST `order_refunded` — payment history shows refunded.
7. Card/Stripe checkout still creates a Stripe session (`cs_…`) and still uses `/api/payments/webhook`.

Unit coverage: `tests/unit/tamara-checkout.test.ts`, `tests/unit/tamara-webhooks.test.ts`. Stripe tests stay green.

## Partner portal

Register the webhook as **Order** events (Approved, Authorised, Declined, Cancelled, OnHold, refunds) to:

`https://www.aviatorpass.com/api/payments/tamara/webhook`

Copy the **Notification token** into `TAMARA_NOTIFICATION_TOKEN` after the merchant portal exposes it.
