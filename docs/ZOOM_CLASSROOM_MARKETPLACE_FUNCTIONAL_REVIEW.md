# AviatorPass Classroom for Zoom — Marketplace Functional Review

**Public URL:** https://www.aviatorpass.com/integrations/zoom-classroom-review  
**Updated:** 28 October 2026 (Asia/Dubai)  
**Source of truth in repo:** `features/zoom/content/classroom-marketplace-functional-review.ts`  
**Final readiness:** `docs/ZOOM_CLASSROOM_MARKETPLACE_FINAL_READINESS.md` — **NOT READY for resubmission**  
**Reviewer one-pager:** `docs/ZOOM_CLASSROOM_MARKETPLACE_REVIEWER_ONEPAGER.md` (Classroom VGTQ only; Z0xA separate)  
**S2S read-scope plan (awaiting approval):** `docs/ZOOM_S2S_MEETING_READ_SCOPE_PLAN.md`  
**Hosting plan:** `docs/ZOOM_CENTRALIZED_HOSTING_PLAN.md`

This document is the operator index for the October 22 functional review notes (notification referenced 27 October 2026). It contains **no passwords, OAuth secrets, access tokens, or ZAK values**.

Do **not** submit Marketplace updates until the account owner approves **and** the readiness blockers are cleared. Do **not** disconnect `ceo@aviatorpass.com`. Do **not** modify Marketplace / CEO / customer settings without approval.

## Related public pages

| Page                                       | URL                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Classroom Meeting SDK docs                 | https://www.aviatorpass.com/integrations/zoom                    |
| Combined final review (both apps)          | https://www.aviatorpass.com/integrations/zoom-marketplace-review |
| Classroom functional review (this package) | https://www.aviatorpass.com/integrations/zoom-classroom-review   |
| Classroom landing                          | https://www.aviatorpass.com/join                                 |
| Instructor OAuth landing (optional)        | https://www.aviatorpass.com/instructor/profile                   |

## Six notes — which remain open

Do **not** rework items that are already satisfied in repo/production. Of the six October 22 functional notes:

| #   | Note                              | Status                         | Remaining work                                                                                                                                                                                     |
| --- | --------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate Create a Meeting scopes | **OPEN** (portal conflict)     | Create a Meeting correctly removed; empty Scopes now fails “Select at least one scope”. See `ZOOM_CLASSROOM_MARKETPLACE_SCOPE_RESOLUTION.md` — Support first; if required add only `user:read:zak` |
| 2   | Meetings surface                  | **OPEN** (Marketplace console) | Owner disables Meetings surface (app opens in AviatorPass browser only)                                                                                                                            |
| 3   | Custom Form                       | **OPEN** (Marketplace console) | Owner removes unused Custom Form                                                                                                                                                                   |
| 4   | Meeting SDK test instructions     | **Resolved**                   | Login + host/student steps + `/join/{classId}` verified; owner links docs URL                                                                                                                      |
| 5   | Reviewer credentials              | **Resolved (accounts)**        | Logins + classroom UI verified; owner pastes passwords into Zoom private Account credentials only                                                                                                  |
| 6   | Consolidated English document     | **Resolved**                   | Live at `/integrations/zoom-classroom-review`                                                                                                                                                      |

Paste text for Zoom reviewer response fields: export `CLASSROOM_REVIEW_ZOOM_PASTE_TEXT` in `features/zoom/content/classroom-marketplace-functional-review.ts` (no passwords).

## Architecture this release

| Integration                           | Role                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| CEO / S2S (`ceo@aviatorpass.com`)     | Create live-class + booking meetings; supply `start_url` for host ZAK |
| Classroom Meeting SDK (suffix `VGTQ`) | JWT signatures for `/join` embed only                                 |
| Instructor OAuth (suffix `Z0xA`)      | Optional future per-instructor hosting — code/credentials retained    |

Instructors never receive CEO passwords, S2S secrets, or unrestricted host credentials. Ownership checks on `/join/{classId}` remain (assigned instructor / enrolled student only).

## Production verification snapshot (28 October 2026 Asia/Dubai)

- Meeting SDK Client ID suffix `VGTQ`, `credentialPairValid: true`
- Instructor OAuth suffix `Z0xA`, scopes without admin create; S2S suffix `uX3Q`
- S2S host `ceo@aviatorpass.com`, `hostZak.ready: true` — **centralized live-class host** for this release
- Reviewer instructor + student AviatorPass logins: success
- Personal Connect Zoom: **not required** when platform S2S is configured
- Isolated reviewer classroom + host/student `/join/{classId}`: **re-verify after deploy**
- Concurrent licensing: one licensed Zoom user typically hosts one concurrent meeting; AviatorPass blocks same-instructor schedule overlap

## Owner Marketplace checklist (manual)

1. AviatorPass Classroom for Zoom → Scopes: remove all user OAuth scopes if any remain.
2. Same app → Surface: disable Meetings.
3. Same app → remove Custom Form.
4. Confirm Embed → Meeting SDK is on.
5. Paste reviewer emails/passwords into **private** Account credentials only.
6. Deploy + link https://www.aviatorpass.com/integrations/zoom-classroom-review in documentation fields.
7. After deploy: `POST /api/admin/zoom/reviewer-classroom`, then verify host/student join on `/join/{classId}` (no personal Connect Zoom required).
8. Submit only after owner approval and after classroom proof succeeds.
