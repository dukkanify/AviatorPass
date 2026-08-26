# DEPLOYMENT_STATUS

**Date:** 2026-08-26  
**Product:** AviatorPass  
**Target repository:** [`dukkanify/AviatorPass`](https://github.com/dukkanify/AviatorPass)  
**Production URL:** https://aviatorpass.vercel.app

---

## Current production state

| Field                  | Live value                                 | Expected                     | Status   |
| ---------------------- | ------------------------------------------ | ---------------------------- | -------- |
| `deployment.gitSha`    | `71c0923ff260f6211532076282aeb146581da1e3` | Latest `main` on AviatorPass | **FAIL** |
| `deployment.gitRef`    | `aviatorpass`                              | `main`                       | **FAIL** |
| `deployment.vercelEnv` | `production`                               | `production`                 | **PASS** |
| `deployment.target`    | `production`                               | `production`                 | **PASS** |
| Health HTTP            | 200                                        | 200                          | **PASS** |
| Homepage HTTP          | 200                                        | 200                          | **PASS** |

### Health response (2026-08-26T20:47:38Z)

```json
{
  "status": "ok",
  "service": "aviatorpass",
  "env": "staging",
  "deployment": {
    "gitSha": "71c0923ff260f6211532076282aeb146581da1e3",
    "gitRef": "aviatorpass",
    "vercelEnv": "production",
    "target": "production"
  }
}
```

Production is **serving a pre-cutover deployment** from the legacy shared repository history.

---

## Vercel configuration (expected)

| Setting            | Expected value                                   | Verified                                  |
| ------------------ | ------------------------------------------------ | ----------------------------------------- |
| Project            | `dukkanify-technology-llcs-projects/aviatorpass` | Documented in `docs/VERCEL_SETUP.md`      |
| Git repository     | `dukkanify/AviatorPass`                          | **FAIL** — live SHA proves legacy link    |
| Production branch  | `main`                                           | **FAIL** — live ref is `aviatorpass`      |
| Framework          | Next.js                                          | **PASS**                                  |
| Build command      | `npm run build` (default)                        | **PASS** (local)                          |
| Output             | Next.js default                                  | **PASS**                                  |
| Node version       | 22 (matches CI)                                  | **PASS** (CI + local)                     |
| Deploy hook secret | `VERCEL_AVIATORPASS_DEPLOY_HOOK`                 | **FAIL** — not configured in agent/GitHub |

---

## GitHub Actions deployment pipeline

| Workflow                            | Trigger                                               | Target            | Remote status     |
| ----------------------------------- | ----------------------------------------------------- | ----------------- | ----------------- |
| `ci.yml`                            | push/PR `main`, `develop`, `aviatorpass`, `cursor/**` | Quality + E2E     | **Not on remote** |
| `deploy-aviatorpass-production.yml` | push `main`, `aviatorpass`                            | Vercel production | **Not on remote** |

Deploy workflow steps:

1. POST `VERCEL_AVIATORPASS_DEPLOY_HOOK` (preferred)
2. Fallback: `vercel build` + `vercel deploy --prebuilt --prod`
3. Smoke: `aviatorpass.vercel.app`, `dubai-test.blog`, `/api/health`

---

## Required actions to reach green deployment

1. **GitHub:** Push `.github/workflows/*` (PAT needs `workflow` scope)
2. **GitHub:** Create environment `Production – aviatorpass` with secrets:
   - `VERCEL_AVIATORPASS_DEPLOY_HOOK` (required)
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (fallback)
3. **Vercel:** Settings → Git → Connect `dukkanify/AviatorPass`, Production Branch = `main`
4. **Deploy:** Push to `main` or fire deploy hook
5. **Verify:** `/api/health` → `gitSha` matches AviatorPass `main` tip

---

## Deployment checklist

| Step                           | Status   |
| ------------------------------ | -------- |
| Dedicated repository live      | **PASS** |
| Local build succeeds           | **PASS** |
| Workflows committed locally    | **PASS** |
| Workflows on GitHub            | **FAIL** |
| Vercel Git re-linked           | **FAIL** |
| Production SHA current         | **FAIL** |
| Deploy hook fires successfully | **FAIL** |
| Health reflects new repo       | **FAIL** |
