# AviatorPass Security Policy

**Product:** AviatorPass (including AviatorPass for Zoom Instructor OAuth)  
**Effective:** 28 October 2026 (Asia/Dubai)  
**Based on:** Verified repository controls (`docs/SECURITY.md`, `services/zoom/*`, auth session/CSRF stack)

## Purpose

This policy states how AviatorPass protects platform users, instructor Zoom connections, and training data.

## Scope

Applies to AviatorPass web application, APIs, admin tools, and Zoom integrations (Instructor OAuth `Z0xA`, Meeting SDK Classroom `VGTQ`, platform Server-to-Server Zoom).

## Controls in force

1. **Least privilege** — Role-based access (`constants/permissions.ts`). Students cannot access instructor or admin routes.
2. **Authentication** — OTP and password flows; HTTP-only session cookies; Secure in production; session revocation.
3. **CSRF** — Mutating API routes enforce CSRF token matching (`enforceMutatingApiSecurity`).
4. **Input validation** — Zod schemas and sanitization for user-supplied text.
5. **Secrets** — Server-only environment variables; Zoom OAuth tokens encrypted at rest (AES-256-GCM) in `services/zoom/crypto.ts`.
6. **OAuth state** — Signed, expiring state for Instructor Zoom connect; open-redirect defenses on return paths.
7. **Transport** — Production serves HTTPS with TLS 1.2+.
8. **Logging** — Security-relevant activity and audit events for privileged actions.
9. **Change control** — Feature branches, lint/typecheck/tests before merge; production deploy via controlled hook/workflow.

## Zoom-specific rules

- Instructor OAuth tokens are never returned to browsers in plaintext.
- Host ZAK / start URLs are issued only to authorized hosts via server APIs.
- CEO/platform S2S credentials are not shared with instructors or students.
- Meeting SDK Client ID/Secret are used only for JWT signing, not mixed with Instructor OAuth secrets.

## Acceptable use

Operators must not export production Zoom tokens, share admin sessions, or run intrusive security testing against live customer sessions without written approval.

## Contact

Security and privacy requests: `support@aviatorpass.com` / `info@aviatorpass.com`.
