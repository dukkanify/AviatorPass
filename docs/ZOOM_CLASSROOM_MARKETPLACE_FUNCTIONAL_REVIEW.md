# AviatorPass Classroom for Zoom — Marketplace Functional Review

**Public URL:** https://www.aviatorpass.com/integrations/zoom-classroom-review  
**Updated:** 28 October 2026 (Asia/Dubai)  
**Source of truth in repo:** `features/zoom/content/classroom-marketplace-functional-review.ts`

This document is the operator index for the October 22 functional review notes (notification referenced 27 October 2026). It contains **no passwords, OAuth secrets, access tokens, or ZAK values**.

Do **not** submit Marketplace updates until the account owner approves. Do **not** disconnect `ceo@aviatorpass.com`.

## Related public pages

| Page                                       | URL                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Classroom Meeting SDK docs                 | https://www.aviatorpass.com/integrations/zoom                    |
| Combined final review (both apps)          | https://www.aviatorpass.com/integrations/zoom-marketplace-review |
| Classroom functional review (this package) | https://www.aviatorpass.com/integrations/zoom-classroom-review   |
| Classroom landing                          | https://www.aviatorpass.com/join                                 |
| Instructor OAuth landing                   | https://www.aviatorpass.com/instructor/profile                   |

## Six notes — which remain open

Do **not** rework items that are already satisfied in repo/production. Of the six October 22 functional notes:

| #   | Note                              | Status                         | Remaining work                                                                                                                  |
| --- | --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate Create a Meeting scopes | **OPEN** (Marketplace console) | Owner removes unused/admin Create a Meeting scopes on Classroom app; keep user `meeting:write:meeting` only on Instructor OAuth |
| 2   | Meetings surface                  | **OPEN** (Marketplace console) | Owner disables Meetings surface (app opens in AviatorPass browser only)                                                         |
| 3   | Custom Form                       | **OPEN** (Marketplace console) | Owner removes unused Custom Form                                                                                                |
| 4   | Meeting SDK test instructions     | **Resolved in repo**           | Owner links public docs URL after deploy                                                                                        |
| 5   | Reviewer credentials              | **Accounts verified**          | Owner pastes passwords into Zoom private Account credentials only                                                               |
| 6   | Consolidated English document     | **Resolved in repo**           | Owner links `/integrations/zoom-classroom-review`                                                                               |

Paste text for Zoom reviewer response fields: export `CLASSROOM_REVIEW_ZOOM_PASTE_TEXT` in `features/zoom/content/classroom-marketplace-functional-review.ts` (no passwords).

## Production verification snapshot (28 October 2026 Asia/Dubai)

- Meeting SDK Client ID suffix `VGTQ`, `credentialPairValid: true`
- Instructor OAuth suffix `Z0xA`, scopes without admin create
- S2S host `ceo@aviatorpass.com`, `hostZak.ready: true`
- Reviewer instructor + student AviatorPass logins: success
- `personalZoomReady`: still **false** → reviewer classroom **409** `oauth_not_connected`

## Owner Marketplace checklist (manual)

1. AviatorPass Classroom for Zoom → Scopes: remove all user OAuth scopes if any remain.
2. Same app → Surface: disable Meetings.
3. Same app → remove Custom Form.
4. Confirm Embed → Meeting SDK is on.
5. Paste reviewer emails/passwords into **private** Account credentials only.
6. Link https://www.aviatorpass.com/integrations/zoom-classroom-review in documentation fields.
7. Submit only after owner approval and after Connect Zoom succeeds for the reviewer instructor.
