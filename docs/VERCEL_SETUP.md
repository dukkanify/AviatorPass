# Vercel — AviatorPass (dedicated GitHub repo)

## Project

| Item                        | Value                                            |
| --------------------------- | ------------------------------------------------ |
| Vercel project              | `dukkanify-technology-llcs-projects/aviatorpass` |
| GitHub repo (after cutover) | `dukkanify/AviatorPass`                          |
| Production URL              | https://aviatorpass.vercel.app                   |
| Production branch           | `main` (or `aviatorpass` during cutover)         |

`vercel.json` sets `"ignoreCommand": "exit 1"` so Git deployments always build. This overrides the dashboard Ignored Build Step, which previously cancelled AviatorPass-only-repo pushes as “Canceled by Ignored Build Step” (GitHub still reports that as a green success).

## Cutover steps

1. Vercel → **aviatorpass** → Settings → Git → connect **`dukkanify/AviatorPass`** (disconnect any legacy shared remote).
2. Set Production Branch = `main`.
3. Ensure Deploy Hook secret in GitHub Environment matches this project only.
4. Push to `main` or run `npm run deploy:production` (POSTs `$VERCEL_AVIATORPASS_DEPLOY_HOOK` only; never hardcode a hook URL).
5. Verify `/api/health` → `deployment.gitSha` matches new repo tip.

## Preview

PRs into `main` / `develop` on `dukkanify/AviatorPass` should create Vercel Preview deployments automatically once Git is connected.

## Isolation

This Vercel project must be linked only to `dukkanify/AviatorPass`. Marketplace products use separate repositories and Vercel projects.
