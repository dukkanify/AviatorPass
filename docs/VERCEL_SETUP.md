# Vercel — AviatorPass (dedicated GitHub repo)

## Project

| Item                        | Value                                            |
| --------------------------- | ------------------------------------------------ |
| Vercel project              | `dukkanify-technology-llcs-projects/aviatorpass` |
| GitHub repo (after cutover) | `dukkanify/AviatorPass`                          |
| Production URL              | https://aviatorpass.vercel.app                   |
| Production branch           | `main` (or `aviatorpass` during cutover)         |

## Cutover steps

1. Vercel → **aviatorpass** → Settings → Git → connect **`dukkanify/AviatorPass`** (disconnect any legacy shared remote).
2. Set Production Branch = `main`.
3. Ensure Deploy Hook secret in GitHub Environment matches this project only.
4. Push to `main` or fire `VERCEL_AVIATORPASS_DEPLOY_HOOK`.
5. Verify `/api/health` → `deployment.gitSha` matches new repo tip.

## Preview

PRs into `main` / `develop` on `dukkanify/AviatorPass` should create Vercel Preview deployments automatically once Git is connected.

## Isolation

This Vercel project must be linked only to `dukkanify/AviatorPass`. Marketplace products use separate repositories and Vercel projects.
