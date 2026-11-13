# Taly support brief — Production OAuth transport failure (AviatorPass)

**Product:** AviatorPass (ATPL PASS)  
**Merchant API host expected:** `https://api.taly.io`  
**Client call:** `POST /uaa/oauth/token` (OAuth2 password grant) then hosted checkout initiate  
**Observed symptom:** Vercel Production functions throw a **transport / fetch failure** before any HTTP status is returned from Taly (client surfaces HTTP 502: “Taly login failed… TLS”).

## Environment

- Hosting: Vercel Fluid Compute (`nodejs` 24.x)
- Project function region setting: `iad1` only (`functionDefaultRegions` / `vercel.json` `regions: ["iad1"]`)
- App Router Taly routes also set `preferredRegion = ["iad1"]`
- No Static IPs enabled on the Vercel project
- Outbound call uses standard HTTPS (`fetch`) to `{TALY_BASE_URL}/uaa/oauth/token`

## Evidence to attach after diagnostic deploy

From Vercel Runtime Logs, lines starting with `[taly-diag] login transport failed`:

- `vercelRegion` — function execution region (`VERCEL_REGION`)
- `baseHost` / `baseKind` — resolved Taly API host
- `errorName` / `errorCode` / `causeCode` / `symptom` — Node/undici failure class (DNS / TLS / timeout / connection_reset)
- `durationMs` / `failedAt`
- `probe` — unauthenticated DNS + TLS + `POST /uaa/oauth/token` reachability from the **same** payment runtime (no merchant credentials)

Note: Fluid Runtime Log field `region` may show edge ingress (for example `bom1`) even when `VERCEL_REGION` is `iad1`.

## Ask for Taly

1. Confirm whether `api.taly.io` (and WAF/CDN in front of it) **allowlists or blocks** egress from Vercel / AWS `us-east-1` (`iad1`) and/or `ap-south-1` (`bom1`).
2. If allowlisting is required, provide the process to allow Vercel / merchant egress (or Static IP guidance).
3. Confirm the Live OAuth token URL and expected Client Basic + password-grant behaviour for our merchant.

## Out of scope / not sent

Merchant API keys, OAuth client secrets, access tokens, Authorization headers, and customer PII are **not** included in diagnostics or this brief.
