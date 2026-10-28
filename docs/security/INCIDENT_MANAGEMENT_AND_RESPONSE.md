# Incident Management and Response Policy

**Product:** AviatorPass  
**Effective:** 28 October 2026 (Asia/Dubai)  
**Based on:** Verified practices in `docs/SECURITY.md` and operational runbooks

## Definition

A security incident is unauthorized access, credential exposure, Zoom token leakage, service abuse that threatens confidentiality/integrity/availability, or confirmed critical vulnerability exploitation.

## Severity

| Level | Examples | Initial response target |
| --- | --- | --- |
| Critical | Auth bypass, Zoom token dump, RCE | Immediate containment |
| High | Privilege escalation, CSRF bypass on sensitive routes | Same business day |
| Medium | Limited information disclosure | Scheduled remediation |
| Low | Hardening gaps without exploit path | Backlog |

## Response steps (verified operational capability)

1. **Detect** — Review ops/activity logs (`services/ops/logging-service.ts`, `services/auth/activity-log.ts`); user/support reports.
2. **Contain** — Enable maintenance mode when required; revoke sessions; disconnect compromised Instructor Zoom rows without touching unrelated CEO S2S unless that path is implicated.
3. **Eradicate** — Patch code; rotate `AUTH_SECRET` / affected Zoom secrets only with owner approval and migration plan; never rotate Meeting SDK or CEO credentials casually.
4. **Recover** — Redeploy known-good build; verify `/api/health`; smoke auth + Zoom status.
5. **Lessons** — Record timeline, root cause, and follow-up in internal tracker (`docs/BUG_TRACKER.md` / ops notes).

## Roles

- **Owner / Super Admin** — Approves credential rotation and Marketplace changes.
- **Engineering** — Implements fixes, runs tests, preserves evidence.
- **Support** — User communications for account impact.

## Evidence preservation

Retain scanner reports, deploy SHAs, and relevant logs under controlled artifact storage. Do not invent incident records.

## Contact

`support@aviatorpass.com`
