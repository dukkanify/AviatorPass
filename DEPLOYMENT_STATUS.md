# DEPLOYMENT_STATUS

**Date:** 2026-08-27  
**Product:** AviatorPass  
**Target repository:** [`dukkanify/AviatorPass`](https://github.com/dukkanify/AviatorPass)  
**Production URL:** https://www.aviatorpass.com

---

## Current production state

Production is served from `main`. Confirm live identity with:

```bash
npm run health:production
```

Expected `/api/health` fields: `env=production`, `gitRef=main`, `target=production`.

---

## How to deploy

Never hardcode a deploy-hook URL. Never POST a retired hook.

1. Set Cursor Cloud / GitHub Environment `Production` secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
   - `VERCEL_AVIATORPASS_DEPLOY_HOOK` (current Production hook from the aviatorpass Vercel project)
2. Trigger:

```bash
npm run deploy:production
```

That POSTs `$VERCEL_AVIATORPASS_DEPLOY_HOOK` and expects HTTP 201.

GitHub Actions workflow `.github/workflows/deploy-aviatorpass-production.yml` runs the same script on push to `main` and on `workflow_dispatch`.

3. Verify:

```bash
npm run health:production
npm run smoke:production
```
