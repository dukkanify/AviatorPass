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
| `send` MX / TXT             | **Missing** (Resend bounce / SPF host not published)                                                 |
| DMARC                       | `v=DMARC1; p=none;`                                                                                  |
| DNS host                    | Namecheap **hosting** NS (`dns1.namecheaphosting.com` / `dns2.namecheaphosting.com`)                 |
| Where to add records        | **cPanel → Zone Editor** — not Namecheap Domain List → Advanced DNS                                  |

The mailer calls Resend, Resend rejects the From domain, OTP `failClosed` rolls back the challenge, and the API returns **We could not send the verification email.**

## Code fallback (in this repo)

If Resend rejects the custom From domain as unverified, the mailer **retries once** using Resend’s onboarding sender (`AviatorPass <beth.t@example.com>`) and keeps `reply_to` as `support@aviatorpass.com`. That lets registration OTP, welcome, and other transactional mail deliver while DNS is unfinished. Messages may show a Resend envelope and can land in spam — the verification screen tells students to check junk.

Unverified-domain errors are **not** retried from the outbox with the same From address (they would fail forever).

Authentication, Stripe, Tamara, Taly, and Zoom were not changed.

## Fix required outside this repo (human / DNS)

1. Open [Resend Domains](https://resend.com/domains) with the same account as `RESEND_API_KEY`.
2. Add `aviatorpass.com` (or click **Register domain** in Super Admin → Platform Settings → Email).
3. Open **cPanel → Zone Editor** for `aviatorpass.com`. Public NS are Namecheap _hosting_ (`dns1.namecheaphosting.com`). Do **not** use Namecheap Domain List → Advanced DNS — those records stay unpublished while hosting NS are in use.
   Super Admin → Platform Settings → Email shows a live public-DNS probe and a **Copy TSV** sheet (`Type / Host / Value / TTL / Priority`). Typical Resend rows:
   - **MX** Host `send` Priority `10` → `feedback-smtp.us-east-1.amazonses.com` (or the exact MX Resend prints).
   - **TXT** Host `send` → `v=spf1 include:amazonses.com ~all`.
   - **TXT** Host `resend._domainkey` → the DKIM public key Resend prints.
   - Keep the apex SPF / MX for existing Namecheap mailbox mail. Live `send.aviatorpass.com` currently publishes a non-Resend host (`feedback.forge.rmta.net` / a non-Amazon SPF). Replace those rows with Resend’s MX/TXT — do not add a second `send` of the same type.
   - Optional **DMARC** stay `p=none` until inboxing is confirmed.
4. Click **Verify** in Resend. Wait until status is `verified`.
5. Confirm `EMAIL_FROM` / Platform sender is `AviatorPass <noreply@aviatorpass.com>` (or another mailbox on the verified domain).
6. Set `ADMIN_NOTIFICATION_EMAIL` (or Super Admin → Platform Settings → Email → Admin notification email) to the **real ops inbox**. If that field is empty, AviatorPass heals it to `support@aviatorpass.com`, then `SUPER_ADMIN_EMAIL`. Registration, purchase, payment, invoice, receipt, and refund events send a copy there. Super Admin → Email **Test email** uses the same inbox. `superadmin@aviatorpass.com` is a demo login, not Gmail — use a mailbox you actually read.

Until step 4 succeeds, branded `noreply@aviatorpass.com` From addresses will fail at Resend. The onboarding-sender fallback above is the in-app workaround so OTP still leaves Resend. Gmail and Outlook inboxing is still better after DNS is verified.

## Runtime behaviour after this change

- Resend is tried first when `RESEND_API_KEY` is set; SMTP is the fallback.
- Failed sends are stored on the outbox and retried by `/api/cron/email-queue` (daily at 06:00 UTC on Hobby; use `*/5 * * * *` on Pro).
- Non-OTP notification emails go through the automation catalog (in-app + email). OTP itself is still sent only by the existing OTP engine — no second “code sent” email.
- Super Admin → Platform Settings → Email shows Resend domain status, public nameservers, a public-DNS probe vs Resend expected records, a cPanel / Namecheap **Copy TSV** sheet, **Register domain**, the resolved admin copy inbox, and recent outbound. **Test email** sends to that inbox.

## Environment

See `.env.production.example`: `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`, `CRON_SECRET`.
