# Email & notifications — AviatorPass

## Root cause (production OTP failure)

Live error from Resend (2026-09-08), recorded in the production outbox:

```
The aviatorpass.com domain is not verified. Please, add and verify your domain on https://resend.com/domains
```

What is already true in Vercel Production:

| Item                        | Status                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`            | Present (health: `Resend API configured`)                                                            |
| `EMAIL_FROM` / sender       | `noreply@aviatorpass.com`                                                                            |
| SMTP                        | Not configured (`smtpHost` empty)                                                                    |
| Provider stored in settings | `smtp` (ignored when only Resend is set)                                                             |
| SPF                         | `v=spf1 +a +mx +ip4:162.0.229.206 include:spf.web-hosting.com ~all` (Namecheap mail, **not** Resend) |
| DKIM for Resend             | **Missing** (`resend._domainkey.aviatorpass.com` NXDOMAIN)                                           |
| DMARC                       | `v=DMARC1; p=none;`                                                                                  |
| DNS host                    | Namecheap (`dns1.namecheaphosting.com`)                                                              |

The mailer calls Resend, Resend rejects the From domain, OTP `failClosed` rolls back the challenge, and the API returns **We could not send the verification email.**

Authentication, Stripe, Tamara, Taly, and Zoom were not changed.

## Fix required outside this repo (human / DNS)

1. Open [Resend Domains](https://resend.com/domains) with the same account as `RESEND_API_KEY`.
2. Add `aviatorpass.com` (or click **Register domain** in Super Admin → Platform Settings → Email).
3. At Namecheap / cPanel DNS, add the records Resend shows (typically):
   - **MX / TXT SPF** — include Resend (`include:amazonses.com` or the exact include Resend prints). Keep existing Namecheap mail if you still receive mail at that domain.
   - **CNAME DKIM** — `resend._domainkey` (and any extra selectors Resend lists).
   - Optional **DMARC** stay `p=none` until inboxing is confirmed.
4. Click **Verify** in Resend. Wait until status is `verified`.
5. Confirm `EMAIL_FROM` / Platform sender is `AviatorPass <noreply@aviatorpass.com>` (or another mailbox on the verified domain).
6. Optional: set `ADMIN_NOTIFICATION_EMAIL` to the ops inbox that should receive registration / purchase / payment / refund copies.

Until step 4 succeeds, Gmail and Outlook delivery **cannot** work. Resend will keep returning the same domain error.

## Runtime behaviour after this change

- Resend is tried first when `RESEND_API_KEY` is set; SMTP is the fallback.
- Failed sends are stored on the outbox and retried by `/api/cron/email-queue` (daily at 06:00 UTC on Hobby; use `*/5 * * * *` on Pro).
- Non-OTP notification emails go through the automation catalog (in-app + email). OTP itself is still sent only by the existing OTP engine — no second “code sent” email.
- Super Admin → Email shows Resend domain status and DNS records.

## Environment

See `.env.production.example`: `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`, `CRON_SECRET`.
