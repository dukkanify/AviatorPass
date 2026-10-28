# SSDLC Evidence — AviatorPass / AviatorPass for Zoom

**Date:** 28 October 2026 (Asia/Dubai)  
**Scope:** Verified practices only (no invented certifications)

## Practices in use

| Practice | Evidence in repository / ops |
| --- | --- |
| Secure coding standards | `docs/CODING_STANDARDS.md`, `docs/SECURITY.md` |
| Least-privilege RBAC | `constants/permissions.ts`, route guards |
| Input validation | Zod schemas; `utils/sanitize.ts` |
| Secret handling | Server env only; Zoom tokens AES-256-GCM (`services/zoom/crypto.ts`) |
| OAuth hardening | Signed expiring state; encrypted token persistence (`services/zoom/oauth-service.ts`) |
| CSRF on mutating APIs | `enforceMutatingApiSecurity` |
| Automated tests | `npm run lint`, `typecheck`, `test`, `test:e2e` / `uat` |
| Dependency awareness | `npm audit` (reports retained in security-beta artifacts) |
| SAST | Semgrep 1.182.1 — before/after JSON under `/opt/cursor/artifacts/security-beta/` |
| DAST (controlled) | OWASP ZAP 2.16.1 quick scan vs `http://127.0.0.1:3000` only |
| Change / deploy control | Feature branches; GitHub Actions deploy workflow; production health wait |
| Incident / vuln process | `docs/security/INCIDENT_MANAGEMENT_AND_RESPONSE.md`, `VULNERABILITY_MANAGEMENT.md` |

## Not claimed

- No SOC 2 / ISO 27001 certificate is asserted here.
- No third-party penetration-test certificate is asserted here.
- Production customer sessions were not actively attacked.
