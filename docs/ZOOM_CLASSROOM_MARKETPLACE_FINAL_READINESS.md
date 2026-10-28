# AviatorPass Classroom for Zoom — Final Readiness Report

**Date:** 28 October 2026 (Asia/Dubai)  
**Verdict:** **NOT READY for Marketplace resubmission**  
**Marketplace submit:** Do not submit until the account owner approves **and** the blockers below are cleared.

This report reviews the consolidated Marketplace package dated 28 October 2026 against live production. It does **not** invent test results. Passwords, OAuth secrets, access tokens, and ZAK values are not included.

## Executive summary

| Area | Result |
| --- | --- |
| Classroom Meeting SDK credentials (suffix `VGTQ`) | PASS — pair valid; JWT path only; no user OAuth scopes in product code |
| Instructor OAuth vs Meeting SDK vs S2S separation | PASS — suffixes `Z0xA` / `VGTQ` / `uX3Q`; `credentialsMixed: false` |
| CEO / platform host (`ceo@aviatorpass.com`) | PASS — `hostZak.ready: true`; **not modified** |
| Reviewer AviatorPass logins | PASS — instructor + student |
| Isolated reviewer classroom | **FAIL / BLOCKED** — `POST /api/admin/zoom/reviewer-classroom` → HTTP 409 `oauth_not_connected` |
| Working `/join/{classId}` for reviewers | **MISSING** — no reviewer class exists |
| Host / student embedded Meeting SDK join | **NOT RUN** — no classroom |
| Real two-way audio/video | **NOT CLAIMED** |
| Classroom review docs page on production | **404** until commit with `/integrations/zoom-classroom-review` is deployed |
| Marketplace portal scopes / surface / Custom Form | **UNVERIFIED from AviatorPass** — owner must confirm in Zoom console |

## 1. Meeting SDK credentials only (no unnecessary user OAuth scopes)

**Completed.**

- In-app join signs JWTs with `getZoomMeetingSdkCredentials()` → `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` only (`lib/zoom/sdk-credentials.ts`, `POST /api/zoom/in-app-session`).
- Production `/api/zoom/status`: Meeting SDK suffix `VGTQ`, `credentialPairValid: true`.
- Instructor OAuth remains a **separate** app (suffix `Z0xA`) with scopes  
  `user:read:user meeting:write:meeting meeting:read:meeting meeting:update:meeting meeting:delete:meeting` — no admin/master create scopes in AviatorPass defaults (`REJECTED_ZOOM_OAUTH_SCOPES`).
- Classroom product code does **not** start a user OAuth consent flow for the Meeting SDK app.

**Caveat:** Whether the Zoom Marketplace *portal* still lists unused Create a Meeting scopes on the Classroom app cannot be read from AviatorPass. That remains an owner console check (Note 1).

## 2–5. Reviewer classroom provisioning (CEO workflow vs personal OAuth)

**Not supported by existing design. Do not bypass.**

| Question | Answer |
| --- | --- |
| Can the reviewer classroom be provisioned via CEO / S2S platform meeting workflow? | **No.** |
| Why? | Production live-class creation requires the assigned instructor’s **personal** Zoom OAuth (`personalZoomReady`). `createMeetingForClass` never falls back to `ceo@aviatorpass.com` / S2S in production. Dev/mock only may use mock meetings. |
| Reviewer API gate | `prepareReviewerClassroom` → `assessReviewerClassroom` returns `oauth_not_connected` when `personalZoomReady` is false; also rejects `shared_platform_zoom` if CEO/platform Zoom is connected to the reviewer instructor. |
| Exact prerequisite | Sign in as `zoom.reviewer.instructor@aviatorpass.com` → `/instructor/profile` → **Connect Zoom** with a **dedicated personal Zoom user** that is **not** `ceo@aviatorpass.com` and **not** a customer Zoom account → confirm Connected + `personalZoomReady: true` → then `POST /api/admin/zoom/reviewer-classroom`. |

**Live probe (28 October 2026, ~12:25 Asia/Dubai):**

- Riley Okonkwo / `zoom.reviewer.instructor@aviatorpass.com`: `connected: false`, `personalZoomReady: false`, `zoomEmail: null`
- `POST /api/admin/zoom/reviewer-classroom`: HTTP **409**, block **`oauth_not_connected`**, `classId: null`
- Existing reviewer classes titled “Marketplace reviewer classroom — ATPL meteorology”: **none**
- No customer classes created/updated/deleted by this readiness run

## 6. Instructor and student access to the same classroom

**Incomplete — blocked by missing classroom.**

| Check | Result |
| --- | --- |
| Instructor login | PASS |
| Student login | PASS |
| Student → `/instructor/profile` | PASS denial (307 → `/access-denied`) |
| Shared reviewer class host/participant | **NOT AVAILABLE** — no `classId` |

## 7. Reviewer documentation and working classroom URL

| Item | Status |
| --- | --- |
| Consolidated package in repo | Present (`features/zoom/content/classroom-marketplace-functional-review.ts`, `docs/ZOOM_CLASSROOM_MARKETPLACE_FUNCTIONAL_REVIEW.md`) |
| Public URL `/integrations/zoom-classroom-review` | **404 on production** (deploy SHA still `6f777ae…`; package commit not live) |
| Meeting SDK docs `/integrations/zoom` | 200 on production |
| Working classroom URL `/join/{classId}` | **None** — blocked by personal Zoom authorization |
| Instructions completeness | Complete for workflows **once** Connect Zoom succeeds; must state classroom URL is pending |

## 8. Six Zoom reviewer notes vs actual Marketplace configuration

AviatorPass **cannot read** Zoom Marketplace portal Features/Scopes/Custom Form. Code + production credential inventory were verified; portal items remain owner-confirmed.

| # | Note | Code / production | Marketplace portal | Ready? |
| --- | --- | --- | --- | --- |
| 1 | Duplicate Create a Meeting scopes | Classroom: no user OAuth in product. Instructor: user scopes only; admin rejected | Owner must confirm Classroom app Scopes are empty of Create a Meeting | **Open (manual)** |
| 2 | Meetings surface | Product opens in AviatorPass `/join` only | Owner must disable Meetings surface if selected | **Open (manual)** |
| 3 | Custom Form | Unused in product | Owner must remove | **Open (manual)** |
| 4 | Meeting SDK testing instructions | Written in repo / SDK docs | Link after deploy | **Repo done; deploy pending** |
| 5 | Reviewer credentials | Logins verified; passwords private store only | Owner pastes into Zoom private Account credentials | **Accounts OK; Zoom paste pending** |
| 6 | Consolidated EN document | Package in repo | Link public URL after deploy | **Repo done; production URL 404** |

## 9. Manual owner actions still required (Zoom Marketplace + AviatorPass)

1. **Connect Zoom** for `zoom.reviewer.instructor@aviatorpass.com` with a dedicated personal Zoom user (never CEO, never customer).
2. After `personalZoomReady: true`, run `POST /api/admin/zoom/reviewer-classroom` (or create the isolated class) and record `/join/{classId}`.
3. Verify host + student embedded Meeting SDK join on that URL (manual A/V on real devices).
4. Classroom Marketplace app → remove any user OAuth / Create a Meeting scopes.
5. Same app → disable Meetings surface.
6. Same app → remove Custom Form.
7. Confirm Embed → Meeting SDK is enabled.
8. Paste reviewer emails/passwords into Zoom **private** Account credentials only.
9. Deploy the Classroom review package so `/integrations/zoom-classroom-review` returns 200; link it in Marketplace docs fields.
10. **Do not submit** Marketplace until owner approval **and** items 1–3 (classroom proof) plus portal notes 1–3 are done.
11. **Do not disconnect** `ceo@aviatorpass.com`.

## 10. Production safety confirmation

| Guardrail | Status |
| --- | --- |
| Customer meetings modified | **None** — readiness probes were login/status/GET list + one failed reviewer-classroom POST |
| CEO credentials / S2S connection modified | **None** — `hostZak.hostUser` remains `ceo@aviatorpass.com`, ready |
| Existing instructor Zoom connections modified | **None** — all listed instructors remain disconnected; no OAuth authorize/revoke performed |
| Authorization / ownership checks bypassed | **No** — CEO/S2S host path for reviewer classroom was evaluated and **rejected** as unsupported |

## Unresolved reviewer blockers (must clear before resubmission)

1. Reviewer instructor personal Zoom not authorized → `oauth_not_connected`.
2. No isolated reviewer classroom / no working `/join/{classId}`.
3. Embedded host/student Meeting SDK proof not run.
4. Classroom review page not live on production (404).
5. Marketplace portal Notes 1–3 not confirmed from this environment.
6. Real two-way A/V not verified.

## Evidence references

- Production health deployment SHA at probe time: `6f777ae9322778acc293d6b75764b978dc238ee1`
- Artifacts: `/opt/cursor/artifacts/classroom-final-readiness-probe.json`, `classroom-final-readiness-zoom-status.json`, `classroom-final-readiness-access.json`
- Design: `services/zoom/reviewer-classroom.ts`, `services/classes/zoom-service.ts` (`createMeetingForClass`), `services/classes/class-service.ts`
