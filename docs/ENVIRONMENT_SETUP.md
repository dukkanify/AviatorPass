# Environment setup — AviatorPass

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required for comfortable local auth:

| Variable               | Example                 |
| ---------------------- | ----------------------- |
| `AUTH_SECRET`          | ≥24 char random string  |
| `ENABLE_DEMO_OTP`      | `true` (local only)     |
| `DEMO_OTP_CODE`        | `123456`                |
| `NEXT_PUBLIC_APP_URL`  | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_NAME` | `AviatorPass`           |
| `NEXT_PUBLIC_APP_ENV`  | `development`           |

Supabase vars may stay empty for JSON-store mode.

## Staging

- Copy `.env.production.example` → staging secrets in Vercel Preview / Staging project.
- Prefer `ENABLE_DEMO_OTP=false` and real email OTP.
- `NEXT_PUBLIC_APP_ENV=staging`.
- Point uptime at staging `/api/health?ready=1`.

## Production

1. Create Vercel project linked to GitHub `main`.
2. Set **all** production env vars from `.env.production.example` (never commit secrets).
3. Mandatory:

| Variable              | Requirement             |
| --------------------- | ----------------------- |
| `AUTH_SECRET`         | Strong unique ≥24 chars |
| `ENABLE_DEMO_OTP`     | **`false`**             |
| `DEMO_OTP_CODE`       | unset                   |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS URL     |
| `NEXT_PUBLIC_APP_ENV` | `production`            |

4. Integrations (as contracted):

| Integration          | Variables                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Email / OTP delivery | Provider-specific (wire via settings + server secrets)                                                                        |
| Zoom                 | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET`                                              |
| Stripe               | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_<CCY>` |
| Supabase             | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`        |

5. Domain: attach custom domain in Vercel (SSL automatic).

### Cursor Cloud / GitHub Actions deploy secrets

Set these in Cursor Cloud secrets and the GitHub Environment `Production`. Never commit values. Never hardcode deploy-hook URLs.

| Variable                         | Role                           |
| -------------------------------- | ------------------------------ |
| `VERCEL_TOKEN`                   | Vercel API access              |
| `VERCEL_ORG_ID`                  | AviatorPass Vercel team        |
| `VERCEL_PROJECT_ID`              | AviatorPass Vercel project     |
| `VERCEL_AVIATORPASS_DEPLOY_HOOK` | Current Production deploy hook |

```bash
npm run deploy:production
```

That command POSTs `$VERCEL_AVIATORPASS_DEPLOY_HOOK` only and refuses retired hooks. 6. CDN: Vercel Edge for static + ISR assets (headers in `next.config.ts` / `vercel.json`). 7. Storage: Supabase Storage bucket `aep-uploads` (or local `public/uploads` only for single-node demos). 8. Scheduled jobs: cron for `npm run backup` / weekly / monthly (or Ops UI + external cron hitting secured ops). 9. Monitoring: external uptime → `/api/health?ready=1`; in-app Ops Center.

## Validation after env change

```bash
npm run lint && npm run typecheck && npm run test && npm run build
# with server:
npm run uat
npm run acceptance
npm run test:e2e
```

## Security reminders

- Never put secrets in `NEXT_PUBLIC_*`.
- Rotate `AUTH_SECRET` only with a planned session revoke window.
- Restrict Stripe/Zoom keys; prefer restricted Stripe keys (`rk_live_…`).
