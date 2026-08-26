# AviatorPass — Required Environment Variables & Runtime Secrets

**Audit date:** 2026-08-26  
**Repository:** `dukkanify/AviatorPass`  
**Method:** Static scan of application source, config, Prisma schema, GitHub Actions workflows, and `.env*.example` templates. Only variables **actually referenced** in code are listed. No invented variables.

**Local-first mode:** The app runs without Supabase, Stripe, or Zoom by default — data persists in `.data/aep-*.json`. Email/SMTP is configured via **Platform Settings** (Super Admin → Email), **not** `process.env`.

---

## Master inventory

| Variable                             | Required                   | Purpose                                                         | Where used                                                                                                                                            | Dev / Prod              | Default                                                       |
| ------------------------------------ | -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                | Optional                   | Canonical public app URL (links, redirects, Stripe return URLs) | `config/env.ts`, `config/site.ts`, `services/payments/gateway.ts`, `services/certificates/certificate-service.ts`, `services/classes/zoom-service.ts` | Both                    | `http://localhost:3000`                                       |
| `NEXT_PUBLIC_APP_NAME`               | Optional                   | Product display name                                            | `config/env.ts`, `services/ops/backup-service.ts`, `services/ops/health-service.ts`                                                                   | Both                    | `AviatorPass`                                                 |
| `NEXT_PUBLIC_APP_ENV`                | Optional                   | Environment gate (`development` \| `staging` \| `production`)   | `config/env.ts`, `middleware.ts`, `services/auth/otp-service.ts`, `services/ops/*`, CI workflows                                                      | Both                    | `development`                                                 |
| `NEXT_PUBLIC_SUPABASE_URL`           | Optional                   | Supabase project URL (browser + server)                         | `config/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `services/ops/backup-service.ts`                        | Both                    | _(unset)_                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Optional                   | Supabase anon key (browser-safe)                                | `config/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`                                                                                   | Both                    | _(unset)_                                                     |
| `NEXT_PUBLIC_AUTH_REDIRECT_URL`      | Optional                   | OAuth / auth callback URL                                       | `config/env.ts`                                                                                                                                       | Both                    | _(unset)_                                                     |
| `NEXT_PUBLIC_MAINTENANCE_MODE`       | Optional                   | Public maintenance gate (`true` \| `false`)                     | `config/env.ts`, `middleware.ts`, `app/api/public/maintenance/route.ts`, `services/support-ops/*`                                                     | Both                    | `false`                                                       |
| `NEXT_PUBLIC_ENABLE_REALTIME`        | Optional                   | Realtime feature flag                                           | `config/env.ts`                                                                                                                                       | Both                    | `true`                                                        |
| `NEXT_PUBLIC_STORAGE_BUCKET`         | Optional                   | Supabase storage bucket name                                    | `config/env.ts`, `services/storage/storage-service.ts`                                                                                                | Both                    | `aep-uploads`                                                 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional                   | Stripe publishable key (client checkout)                        | `services/payments/store.ts`                                                                                                                          | Both                    | _(unset)_                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`          | Optional*                  | Supabase admin/service role (server-only)                       | `config/env.ts`, `lib/supabase/admin.ts`                                                                                                              | Both                    | _(unset)_                                                     |
| `DATABASE_URL`                       | Optional                   | PostgreSQL connection (Prisma)                                  | `config/env.ts`, `database/prisma/schema.prisma`                                                                                                      | Both                    | _(unset)_                                                     |
| `DIRECT_URL`                         | Optional                   | Direct Postgres URL for Prisma migrations                       | `config/env.ts`, `database/prisma/schema.prisma`                                                                                                      | Both                    | _(unset)_                                                     |
| `AUTH_SECRET`                        | **Required in production** | Session/JWT signing secret                                      | `config/env.ts`, `lib/security/session-token.ts`, `services/api-platform/token-service.ts`, `services/ops/health-service.ts`                          | Both                    | `aep-dev-auth-secret-change-me` (dev only; ≥24 chars in prod) |
| `AUTH_OTP_EXPIRY_MINUTES`            | Optional                   | OTP time-to-live (minutes)                                      | `config/env.ts`, `services/auth/otp-service.ts`                                                                                                       | Both                    | `10`                                                          |
| `AUTH_SESSION_DAYS`                  | Optional                   | Default session lifetime (days)                                 | `config/env.ts`, `services/auth/auth-service.ts`                                                                                                      | Both                    | `7`                                                           |
| `AUTH_REMEMBER_ME_DAYS`              | Optional                   | Remember-me session lifetime (days)                             | `config/env.ts`, `services/auth/auth-service.ts`                                                                                                      | Both                    | `30`                                                          |
| `ENABLE_DEMO_OTP`                    | Optional                   | Allow fixed demo OTP code                                       | `config/env.ts`, `services/auth/otp-service.ts`, `services/ops/health-service.ts`, CI/e2e                                                             | Dev/CI                  | `true` (forced `false` when `NEXT_PUBLIC_APP_ENV=production`) |
| `FORCE_DEMO_OTP`                     | Optional                   | Force demo OTP even under `NODE_ENV=production` (CI/e2e)        | `services/auth/otp-service.ts`, `.github/workflows/ci.yml`, `playwright.config.ts`, tests                                                             | CI/e2e                  | _(unset)_                                                     |
| `DEMO_OTP_CODE`                      | Optional                   | Fixed 6-digit demo OTP                                          | `config/env.ts`, `services/auth/otp-service.ts`, CI/e2e                                                                                               | Dev/CI                  | `123456`                                                      |
| `SUPER_ADMIN_EMAIL`                  | Optional                   | Super Admin seed email                                          | `config/env.ts`, `services/auth/seed.ts`                                                                                                              | Both                    | `superadmin@eagerpilots.com`                                  |
| `SUPER_ADMIN_FIRST_NAME`             | Optional                   | Super Admin seed first name                                     | `config/env.ts`, `services/auth/seed.ts`                                                                                                              | Both                    | `Super`                                                       |
| `SUPER_ADMIN_LAST_NAME`              | Optional                   | Super Admin seed last name                                      | `config/env.ts`, `services/auth/seed.ts`                                                                                                              | Both                    | `Admin`                                                       |
| `ZOOM_ACCOUNT_ID`                    | Optional                   | Zoom Server-to-Server OAuth account ID                          | `config/env.ts`, `services/classes/zoom-service.ts`, `services/settings/settings-service.ts`                                                          | Both                    | _(unset — mock mode)_                                         |
| `ZOOM_CLIENT_ID`                     | Optional                   | Zoom OAuth client ID                                            | `config/env.ts`, `services/classes/zoom-service.ts`, `services/settings/settings-service.ts`, `services/ops/*`, `services/api-platform/seed.ts`       | Both                    | _(unset — mock mode)_                                         |
| `ZOOM_CLIENT_SECRET`                 | Optional                   | Zoom OAuth client secret                                        | `config/env.ts`, `services/classes/zoom-service.ts`, `services/settings/settings-service.ts`                                                          | Both                    | _(unset — mock mode)_                                         |
| `ZOOM_WEBHOOK_SECRET`                | Optional**                 | Zoom inbound webhook HMAC secret                                | `app/api/v1/webhooks/inbound/zoom/route.ts`                                                                                                           | Prod when webhooks used | _(unset)_                                                     |
| `STRIPE_SECRET_KEY`                  | Optional                   | Stripe API secret (live/test)                                   | `services/payments/gateway.ts`, `services/payments/store.ts`, `services/ops/health-service.ts`, `services/api-platform/seed.ts`                       | Both                    | _(unset — mock gateway)_                                      |
| `STRIPE_WEBHOOK_SECRET`              | Optional                   | Stripe webhook signing secret                                   | `services/payments/gateway.ts`, `services/payments/store.ts`                                                                                          | Prod when webhooks used | _(unset)_                                                     |
| `CRON_SECRET`                        | Optional                   | Auth header for installment cron endpoint                       | `app/api/payments/installments/process/route.ts`                                                                                                      | Prod when cron exposed  | _(unset — endpoint open if unset)_                            |
| `REMINDER_CRON_SECRET`               | Optional                   | Alias/fallback for `CRON_SECRET`                                | `app/api/payments/installments/process/route.ts`                                                                                                      | Prod when cron exposed  | _(unset)_                                                     |
| `NODE_ENV`                           | Auto                       | Next.js runtime mode (`development` \| `production` \| `test`)  | `next.config.ts`, `lib/security/cookies.ts`, `services/email/mailer.ts`, `services/auth/otp-service.ts`, multiple API routes                          | Auto-injected           | Set by Next.js / CI                                           |
| `VERCEL_GIT_COMMIT_SHA`              | Auto                       | Deployment commit SHA (health metadata)                         | `app/api/health/route.ts`                                                                                                                             | Vercel                  | Injected by Vercel                                            |
| `VERCEL_GIT_COMMIT_REF`              | Auto                       | Deployment git ref                                              | `app/api/health/route.ts`                                                                                                                             | Vercel                  | Injected by Vercel                                            |
| `VERCEL_ENV`                         | Auto                       | Vercel environment (`production`, `preview`, `development`)     | `app/api/health/route.ts`                                                                                                                             | Vercel                  | Injected by Vercel                                            |
| `VERCEL_URL`                         | Auto                       | Deployment hostname                                             | `app/api/health/route.ts`                                                                                                                             | Vercel                  | Injected by Vercel                                            |
| `VERCEL_TARGET_ENV`                  | Auto                       | Vercel target environment                                       | `app/api/health/route.ts`                                                                                                                             | Vercel                  | Injected by Vercel                                            |
| `GITHUB_SHA`                         | Auto                       | CI commit SHA fallback for health                               | `app/api/health/route.ts`                                                                                                                             | GitHub Actions          | Injected by Actions                                           |
| `GITHUB_REF_NAME`                    | Auto                       | CI branch/ref fallback for health                               | `app/api/health/route.ts`                                                                                                                             | GitHub Actions          | Injected by Actions                                           |
| `COMMIT_SHA`                         | Auto                       | Generic commit SHA override                                     | `app/api/health/route.ts`                                                                                                                             | Either                  | _(unset)_                                                     |
| `CI`                                 | Test/CI                    | Marks CI runner (Playwright retries, web server mode)           | `playwright.config.ts`, `.github/workflows/ci.yml`                                                                                                    | CI only                 | `true` in Actions                                             |
| `PLAYWRIGHT_PORT`                    | Test/CI                    | E2E server port                                                 | `playwright.config.ts`                                                                                                                                | CI/local e2e            | `3000`                                                        |
| `PLAYWRIGHT_BASE_URL`                | Test/CI                    | E2E base URL                                                    | `playwright.config.ts`                                                                                                                                | CI/local e2e            | `http://127.0.0.1:{PORT}`                                     |
| `PLAYWRIGHT_SKIP_WEBSERVER`          | Test/CI                    | Skip Playwright-managed web server                              | `playwright.config.ts`                                                                                                                                | CI/local e2e            | _(unset)_                                                     |

\* Required only when Supabase admin features are used (`lib/supabase/admin.ts` throws if missing while Supabase is configured).

\*\* Required when `NODE_ENV=production` or `NEXT_PUBLIC_APP_ENV=production` and the Zoom webhook route is hit (`app/api/v1/webhooks/inbound/zoom/route.ts` returns 503 if secret missing).

---

## Not environment variables (Platform Settings)

These integrations are **not** read from `process.env` in application source:

| Capability                 | Configuration path                                                               |
| -------------------------- | -------------------------------------------------------------------------------- |
| SMTP / email provider      | Super Admin → Platform Settings → Email (persisted in `.data/aep-settings.json`) |
| Resend / SendGrid API keys | Platform Settings (not wired to env in `services/email/mailer.ts`)               |
| Branding overrides         | Platform Settings + `config/branding.ts`                                         |
| Payment provider toggle    | Platform Settings (`mock` vs `stripe`)                                           |

See `services/email/mailer.ts` — SMTP uses settings; without SMTP host, messages go to `.data/aep-email-outbox.json`.

---

## Classification

### 1. Required for Cloud Environment (Cursor Cloud Agent)

These are **not** application runtime vars but are needed for agent git/deploy operations in this repository:

| Secret                      | Required          | Purpose                                                                               | Referenced in                                          |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `AVIATORPASS_PUSH_TOKEN`    | Recommended       | GitHub PAT with `repo` (+ `workflow` for workflow pushes) for `dukkanify/AviatorPass` | `docs/archive/migration/scripts/cutover-push-local.sh` |
| `AVIATORPASS_SSH_KEY`       | Optional          | Deploy key path for git push fallback                                                 | Cloud agent VM (not in app source)                     |
| `GH_TOKEN` / `GITHUB_TOKEN` | Optional fallback | Generic GitHub token for push scripts                                                 | `docs/archive/migration/scripts/cutover-push-local.sh` |

**Cloud Environment app vars (minimal — local JSON mode):**

| Variable              | Value for Cloud dev                                  |
| --------------------- | ---------------------------------------------------- |
| `AUTH_SECRET`         | Any string ≥24 chars (or accept dev default locally) |
| `ENABLE_DEMO_OTP`     | `true`                                               |
| `DEMO_OTP_CODE`       | `123456`                                             |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000`                              |
| `NEXT_PUBLIC_APP_ENV` | `development`                                        |

No Supabase/Stripe/Zoom secrets are required for Cloud Agent development with `npm run demo:seed`.

---

### 2. Required for Vercel (Production)

| Variable                        | Required    | Notes                                                                     |
| ------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `AUTH_SECRET`                   | **Yes**     | Strong unique value, ≥24 characters                                       |
| `NEXT_PUBLIC_APP_URL`           | **Yes**     | Canonical HTTPS URL (e.g. `https://dubai-test.blog` or production domain) |
| `NEXT_PUBLIC_APP_ENV`           | **Yes**     | `production`                                                              |
| `ENABLE_DEMO_OTP`               | **Yes**     | Must be `false`                                                           |
| `DEMO_OTP_CODE`                 | **No**      | Leave unset in production                                                 |
| `SUPER_ADMIN_EMAIL`             | Recommended | Ops contact for seeded Super Admin                                        |
| `NEXT_PUBLIC_AUTH_REDIRECT_URL` | Recommended | `{APP_URL}/auth/callback`                                                 |

**Required when using Supabase (not JSON-store mode):**

| Variable                        |
| ------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY`     |
| `DATABASE_URL`                  |
| `DIRECT_URL`                    |
| `NEXT_PUBLIC_STORAGE_BUCKET`    |

**Required when using live Zoom:**

| Variable              |
| --------------------- |
| `ZOOM_ACCOUNT_ID`     |
| `ZOOM_CLIENT_ID`      |
| `ZOOM_CLIENT_SECRET`  |
| `ZOOM_WEBHOOK_SECRET` |

**Required when using live Stripe:**

| Variable                             |
| ------------------------------------ |
| `STRIPE_SECRET_KEY`                  |
| `STRIPE_WEBHOOK_SECRET`              |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |

**Recommended for secured cron (installment processor):**

| Variable                                |
| --------------------------------------- |
| `CRON_SECRET` or `REMINDER_CRON_SECRET` |

**Auto-injected by Vercel (do not set manually):**

`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_TARGET_ENV`, `NODE_ENV`

Templates: `.env.production.example`, `.env.staging.example`

---

### 3. Required for GitHub Actions

#### CI workflow (`.github/workflows/ci.yml`)

Set inline in workflow — **no repository secrets required**:

| Variable               | CI value                                          |
| ---------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`  | `http://localhost:3000` / `http://127.0.0.1:3000` |
| `NEXT_PUBLIC_APP_NAME` | `AviatorPass`                                     |
| `NEXT_PUBLIC_APP_ENV`  | `development`                                     |
| `AUTH_SECRET`          | `ci-auth-secret-at-least-24-chars`                |
| `ENABLE_DEMO_OTP`      | `true`                                            |
| `FORCE_DEMO_OTP`       | `true` (e2e job only)                             |
| `DEMO_OTP_CODE`        | `123456`                                          |
| `CI`                   | `true` (e2e job)                                  |

#### Deploy workflow (`.github/workflows/deploy-aviatorpass-production.yml`)

GitHub Environment: **`Production – aviatorpass`**

| Secret                           | Required      | Purpose                                         |
| -------------------------------- | ------------- | ----------------------------------------------- |
| `VERCEL_AVIATORPASS_DEPLOY_HOOK` | **Preferred** | POST deploy hook for AviatorPass Vercel project |
| `VERCEL_TOKEN`                   | Fallback      | Vercel CLI deploy if hook missing               |
| `VERCEL_ORG_ID`                  | Fallback      | With token — `vercel pull`                      |
| `VERCEL_PROJECT_ID`              | Fallback      | With token — pin AviatorPass project            |

At least one path must be configured: deploy hook **or** token.

---

### 4. Optional (feature / convenience)

All variables marked **Optional** in the master inventory, including:

- Full Supabase stack (app works on JSON files without it)
- Zoom trio (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`) — mock mode
- Stripe trio — mock gateway
- `CRON_SECRET` / `REMINDER_CRON_SECRET` — only if exposing cron publicly
- `NEXT_PUBLIC_MAINTENANCE_MODE`, `NEXT_PUBLIC_ENABLE_REALTIME`
- `AUTH_OTP_EXPIRY_MINUTES`, `AUTH_SESSION_DAYS`, `AUTH_REMEMBER_ME_DAYS`
- `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`
- `FORCE_DEMO_OTP` (CI/e2e only)
- `PLAYWRIGHT_*` (local/CI e2e only)
- `COMMIT_SHA` (manual health override)

---

### 5. Legacy (remove — do not configure)

These names appear in **archived migration docs** or isolation guards as **forbidden** shared-product secrets. They are **not referenced** by active application code:

| Legacy name                         | Reason                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `VERCEL_DEPLOY_HOOK`                | Shared/marketplace hook — replaced by `VERCEL_AVIATORPASS_DEPLOY_HOOK` |
| `VERCEL_SOOQNA_*`                   | Wrong product (Sooqnah) — AviatorPass-only isolation                   |
| Any Sooqnah/UAE-Sales deploy tokens | Product separation violation                                           |

Verified by `scripts/verify-product-isolation.mjs` — deploy workflow must reference `VERCEL_AVIATORPASS_DEPLOY_HOOK` or AviatorPass `VERCEL_TOKEN` + project ids only.

---

## Environment readiness checklist (100%)

Use this checklist to reach full environment readiness. Check items off as completed.

### A. Local / Cloud Agent development — **baseline (JSON mode)**

- [ ] `npm ci` succeeds
- [ ] `npm run demo:seed` seeds demo accounts
- [ ] `.env.local` copied from `.env.example` (or rely on defaults)
- [ ] `AUTH_SECRET` set to ≥24 chars (recommended even locally)
- [ ] `ENABLE_DEMO_OTP=true`, `DEMO_OTP_CODE=123456`
- [ ] `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- [ ] `npm run lint && npm run typecheck && npm run test && npm run build` pass

**Score when complete:** 40% (dev-ready)

---

### B. GitHub Actions CI/CD

- [ ] `.github/workflows/ci.yml` present on default branch
- [ ] `.github/workflows/deploy-aviatorpass-production.yml` present on default branch
- [ ] GitHub Environment **`Production – aviatorpass`** created
- [ ] Secret **`VERCEL_AVIATORPASS_DEPLOY_HOOK`** set (preferred)
- [ ] Or fallback: `VERCEL_TOKEN` + `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (AviatorPass project only)
- [ ] Cloud Agent PAT has `workflow` scope (for workflow file pushes)
- [ ] CI job green on `main`
- [ ] Deploy workflow succeeds on push to `main`

**Score when complete:** +25% → **65%**

---

### C. Vercel production runtime (minimum viable)

- [ ] Vercel project linked to `dukkanify/AviatorPass` (`main` production branch)
- [ ] `AUTH_SECRET` — strong, unique, ≥24 chars
- [ ] `NEXT_PUBLIC_APP_URL` — canonical HTTPS domain
- [ ] `NEXT_PUBLIC_APP_ENV=production`
- [ ] `ENABLE_DEMO_OTP=false`
- [ ] `DEMO_OTP_CODE` unset
- [ ] `SUPER_ADMIN_EMAIL` set to ops address
- [ ] `NEXT_PUBLIC_AUTH_REDIRECT_URL={APP_URL}/auth/callback`
- [ ] `/api/health` returns current `gitSha` matching deployed commit
- [ ] `/api/health?ready=1` returns ready status

**Score when complete:** +20% → **85%**

---

### D. Integrations (as contracted — enable only what you use)

#### Email (Platform Settings, not env)

- [ ] SMTP host/user/password configured in Super Admin → Email
- [ ] Test OTP / notification delivery (not demo OTP in prod)

#### Supabase (if replacing JSON store)

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `DATABASE_URL` + `DIRECT_URL`
- [ ] `NEXT_PUBLIC_STORAGE_BUCKET=aep-uploads`

#### Zoom (if live classes)

- [ ] `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- [ ] `ZOOM_WEBHOOK_SECRET` + webhook URL registered

#### Stripe (if live payments)

- [ ] `STRIPE_SECRET_KEY` (prefer restricted `rk_live_…`)
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

#### Cron (if exposing installment processor publicly)

- [ ] `CRON_SECRET` or `REMINDER_CRON_SECRET`
- [ ] External scheduler sends `x-cron-secret` or `Authorization: Bearer …`

**Score when all contracted integrations configured:** +10% → **95%**

---

### E. Security & isolation (final 5%)

- [ ] No legacy secrets (`VERCEL_DEPLOY_HOOK`, `VERCEL_SOOQNA_*`) in GitHub or Vercel
- [ ] `npm run verify:isolation` passes
- [ ] Production health check: demo OTP disabled (`ENABLE_DEMO_OTP=false`)
- [ ] Production health check: `AUTH_SECRET` not default dev value
- [ ] Branch protection enabled on `main` (optional but recommended)

**Score when complete:** **100% environment readiness**

---

## Quick reference by file

| File                                                  | Variables                                            |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `config/env.ts`                                       | All validated public + server env (see master table) |
| `database/prisma/schema.prisma`                       | `DATABASE_URL`, `DIRECT_URL`                         |
| `next.config.ts`                                      | `NODE_ENV`                                           |
| `middleware.ts`                                       | via `publicEnv.NEXT_PUBLIC_MAINTENANCE_MODE`         |
| `lib/supabase/*`                                      | Supabase public + service role                       |
| `lib/security/*`                                      | `AUTH_SECRET`, `NODE_ENV`                            |
| `services/payments/gateway.ts`                        | Stripe + `NEXT_PUBLIC_APP_URL`                       |
| `services/classes/zoom-service.ts`                    | Zoom OAuth + `NEXT_PUBLIC_APP_URL`                   |
| `app/api/health/route.ts`                             | Vercel/GitHub deployment metadata                    |
| `app/api/v1/webhooks/inbound/zoom/route.ts`           | `ZOOM_WEBHOOK_SECRET`                                |
| `app/api/payments/installments/process/route.ts`      | `CRON_SECRET`, `REMINDER_CRON_SECRET`                |
| `.github/workflows/ci.yml`                            | CI inline env block                                  |
| `.github/workflows/deploy-aviatorpass-production.yml` | GitHub secrets (Vercel deploy)                       |
| `playwright.config.ts`                                | `PLAYWRIGHT_*`, `CI`, demo OTP vars                  |

---

## Source templates

| Template                  | Use                                   |
| ------------------------- | ------------------------------------- |
| `.env.example`            | Local development                     |
| `.env.staging.example`    | Staging / preview (`dubai-test.blog`) |
| `.env.production.example` | Production Vercel env vars            |

Never commit real secrets. Copy values into Vercel Project → Settings → Environment Variables or GitHub Environment secrets.
