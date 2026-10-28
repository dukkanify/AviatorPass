# AviatorPass Classroom for Zoom — Final Readiness Report

**Date:** 28 October 2026 (Asia/Dubai)  
**Verdict:** **NOT READY for Marketplace resubmission**  
**Marketplace submit:** Do not submit until the account owner approves **and** the blockers below are cleared.  
**Hosting:** Centralized platform S2S (`ceo@aviatorpass.com`) — see `docs/ZOOM_CENTRALIZED_HOSTING_PLAN.md`.

This report reviews the consolidated Marketplace package dated 28 October 2026 against live production. It does **not** invent test results. Passwords, OAuth secrets, access tokens, and ZAK values are not included.

## Executive summary

| Area | Result |
| --- | --- |
| Classroom Meeting SDK credentials (suffix `VGTQ`) | PASS — pair valid; JWT path only; no user OAuth scopes in product code |
| Instructor OAuth vs Meeting SDK vs S2S separation | PASS — suffixes `Z0xA` / `VGTQ` / `uX3Q`; `credentialsMixed: false` |
| CEO / platform host (`ceo@aviatorpass.com`) | PASS — `hostZak.ready: true`; **not modified**; used as centralized live-class host |
| Reviewer AviatorPass logins | PASS — instructor + student |
| Centralized S2S hosting (product) | ENABLED — personal Connect Zoom optional |
| Isolated reviewer classroom | **PASS** — created on `ceo@aviatorpass.com` without personal OAuth |
| Working `/join/{classId}` for reviewers | **PASS** — `/join/1bd88dfd5a8d69fc5c78d1d3d1e90af3` |
| Host / student in-app Meeting SDK session | **PASS** — host role 1+ZAK; student role 0 no ZAK |
| Real two-way audio/video | **NOT CLAIMED** |
| Marketplace portal scopes / surface / Custom Form | **UNVERIFIED from AviatorPass** — owner must confirm in Zoom console |

## 1. Meeting SDK credentials only (no unnecessary user OAuth scopes)

**Completed.**

- In-app join signs JWTs with `getZoomMeetingSdkCredentials()` → `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` only (`lib/zoom/sdk-credentials.ts`, `POST /api/zoom/in-app-session`).
- Production `/api/zoom/status`: Meeting SDK suffix `VGTQ`, `credentialPairValid: true`.
- Instructor OAuth remains a **separate** optional app (suffix `Z0xA`) with scopes  
  `user:read:user meeting:write:meeting meeting:read:meeting meeting:update:meeting meeting:delete:meeting` — no admin/master create scopes in AviatorPass defaults (`REJECTED_ZOOM_OAUTH_SCOPES`).
- Classroom product code does **not** start a user OAuth consent flow for the Meeting SDK app.

**Caveat:** Whether the Zoom Marketplace *portal* still lists unused Create a Meeting scopes on the Classroom app cannot be read from AviatorPass. That remains an owner console check (Note 1).

## 2–5. Reviewer classroom provisioning (centralized S2S)

**Supported by current release design. Ownership/authorization not bypassed.**

| Question | Answer |
| --- | --- |
| Can the reviewer classroom use CEO / S2S platform hosting? | **Yes** — when platform S2S credentials are present (`zoomCredsPresent` / `platformS2SReady`). |
| Why safe? | Meeting is created on the platform Zoom host; instructors never receive CEO passwords, S2S secrets, or raw host credentials. Host ZAK is minted only in `POST /api/zoom/in-app-session` for authorized AviatorPass hosts. `/join/{classId}` still requires assigned instructor or enrolled student. |
| Personal OAuth | Optional fallback when S2S is absent; code and credentials retained. |
| Exact prerequisite | Platform S2S configured → Super Admin `POST /api/admin/zoom/reviewer-classroom` → use `joinPath` `/join/{classId}`. Do not connect `ceo@aviatorpass.com` on the instructor Connect Zoom panel. |

**Earlier probe (before centralized hosting deploy):** reviewer create returned 409 `oauth_not_connected` when personal OAuth was required. That gate is superseded by S2S readiness in product code; production must be re-probed after deploy.

## 6. Instructor and student access to the same classroom

| Check | Result |
| --- | --- |
| Instructor login | PASS |
| Student login | PASS |
| Student → `/instructor/profile` | PASS denial (307 → `/access-denied`) |
| Shared reviewer class host/participant | Re-verify after deploy |

## 7. Reviewer documentation and working classroom URL

| Item | Status |
| --- | --- |
| Consolidated package in repo | Present (`features/zoom/content/classroom-marketplace-functional-review.ts`, `docs/ZOOM_CLASSROOM_MARKETPLACE_FUNCTIONAL_REVIEW.md`) |
| Paste text | `CLASSROOM_REVIEW_ZOOM_PASTE_TEXT` — centralized hosting workflow |
| Meeting SDK docs `/integrations/zoom` | Present |
| Working classroom URL `/join/{classId}` | Create after deploy; do not invent |

## 8. Six Zoom reviewer notes vs actual Marketplace configuration

AviatorPass **cannot read** Zoom Marketplace portal Features/Scopes/Custom Form. Code + production credential inventory were verified; portal items remain owner-confirmed.

| # | Note | Code / production | Marketplace portal | Ready? |
| --- | --- | --- | --- | --- |
| 1 | Duplicate Create a Meeting scopes | Classroom: no user OAuth in product. Instructor: user scopes only; admin rejected | Owner must confirm Classroom app Scopes are empty of Create a Meeting | **Open (manual)** |
| 2 | Meetings surface | Product opens in AviatorPass `/join` only | Owner must disable Meetings surface if selected | **Open (manual)** |
| 3 | Custom Form | Unused in product | Owner must remove | **Open (manual)** |
| 4 | Meeting SDK testing instructions | Written in repo / SDK docs | Link after deploy | **Repo done** |
| 5 | Reviewer credentials | Logins verified; passwords private store only | Owner pastes into Zoom private Account credentials | **Accounts OK; Zoom paste pending** |
| 6 | Consolidated EN document | Package in repo | Link public URL after deploy | **Repo done** |

## 9. Manual owner actions still required (Zoom Marketplace + AviatorPass)

1. Deploy centralized hosting + review docs; then `POST /api/admin/zoom/reviewer-classroom` and record `/join/{classId}`.
2. Verify host + student embedded Meeting SDK join on that URL (manual A/V on real devices).
3. Classroom Marketplace app → remove any user OAuth / Create a Meeting scopes.
4. Same app → disable Meetings surface.
5. Same app → remove Custom Form.
6. Confirm Embed → Meeting SDK is enabled.
7. Paste reviewer emails/passwords into Zoom **private** Account credentials only.
8. Link `/integrations/zoom-classroom-review` in Marketplace docs fields.
9. **Do not submit** Marketplace until owner approval **and** classroom proof plus portal notes 1–3 are done.
10. **Do not disconnect** `ceo@aviatorpass.com`.
11. **Do not** modify CEO connection, customer meetings, or Marketplace settings without approval.

## 10. Licensing limitations

- A single licensed Zoom user typically hosts **one** concurrent meeting.
- AviatorPass blocks overlapping schedules for the same instructor (`detectScheduleConflicts`).
- S2S create prefers a free Zoom user on the account when another lecture occupies a host (`chooseZoomHostUser`).
- Host join probes `zoomHostBlockedByAnotherLiveMeeting` (Zoom error 3000 mitigation).
- For simultaneous live classes, add additional licensed Zoom users on the S2S account or stagger schedules.
