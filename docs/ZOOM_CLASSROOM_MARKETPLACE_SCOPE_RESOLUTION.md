# AviatorPass Classroom for Zoom — Marketplace Scope Blocker Resolution Plan

**Date:** 28 October 2026 (Asia/Dubai)  
**Application:** AviatorPass Classroom for Zoom (Meeting SDK)  
**Status:** Resolution plan only — **do not submit or recreate** the Marketplace application without owner approval.  
**Do not modify:** Instructor OAuth app (`ZOOM_INSTRUCTOR_*` / Client ID suffix `Z0xA`) or CEO Server-to-Server OAuth (`ceo@aviatorpass.com` / S2S suffix `uX3Q`).  
**Preserve:** Production Meeting SDK credentials (`ZOOM_CLIENT_*` / Client ID suffix `VGTQ`).

## Problem statement

After removing unnecessary scopes (including duplicate Create a Meeting admin/master scopes per Zoom reviewer feedback), the Production **Scopes** page shows:

> Select at least one scope

Classroom product code embeds meetings with a **Meeting SDK JWT** and does **not** run user-managed OAuth on this Client ID. Meeting create / instructor Connect Zoom belong to the separate **AviatorPass for Zoom** Instructor OAuth application.

## 1. Verified application type and product configuration

| Item | Verified configuration |
| --- | --- |
| Marketplace product | **General App** with **Features → Embed → Meeting SDK** enabled (official Meeting SDK credential path) |
| Production Client ID suffix | `VGTQ` (`credentialPairValid: true` on production `/api/zoom/status`) |
| Runtime auth for embed | Server-signed Meeting SDK JWT via `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` (`lib/zoom/sdk-credentials.ts`, `POST /api/zoom/in-app-session`) |
| User OAuth on this Client ID | **Not used** by AviatorPass Classroom flows |
| Meeting create | Separate Instructor OAuth app only (`meeting:write:meeting` on `Z0xA`) |
| Host ZAK today | From instructor personal OAuth / meeting `start_url` path — **not** from Classroom app OAuth token exchange |
| CEO / S2S | Separate credential set for platform booking host; must remain connected |

**Conclusion:** The existing app type is the supported Meeting SDK configuration. Recreating the app would rotate Client ID/Secret and break production JWT signing — **do not recreate** without an explicit migration plan and owner approval.

## 2. Does this app type require at least one OAuth scope for publication?

**Portal / build-flow:** Yes. Zoom’s General App build flow uses a Scopes page that blocks progress when no scopes are selected (“Select at least one scope”). This is a Marketplace console validation constraint, not a Meeting SDK JWT runtime requirement.

**Meeting SDK JWT runtime:** No OAuth scope is required to *sign* or *verify* a Meeting SDK JWT. Participant join with role `0` uses JWT only.

**Official Meeting SDK docs** ([Get credentials](https://developers.zoom.us/docs/meeting-sdk/get-credentials/)): after enabling Meeting SDK, the Scopes page instructs developers to select scopes; for **user-managed** Meeting SDK apps that retrieve a ZAK via that same app’s OAuth, Zoom documents:

- **User → View a user's zak token** (granular scope id: `user:read:zak`)

Admin-managed Meeting SDK apps are documented toward broader user admin scopes — **not** appropriate for AviatorPass Classroom (user-managed / instructor-owned meetings).

## 3. Official Zoom Marketplace / Meeting SDK requirements (evidence)

| Source | What it states | Implication for Classroom |
| --- | --- | --- |
| [Get credentials](https://developers.zoom.us/docs/meeting-sdk/get-credentials/) | Enable Embed → Meeting SDK; then Select scopes; user-managed MSDK: **View a user's zak token** | Portal expects a Scopes selection; documented MSDK-oriented minimal user scope is ZAK read |
| [Meeting SDK auth](https://developers.zoom.us/docs/meeting-sdk/auth/) | JWT base auth; JWT+ZAK to start/join as Zoom user; JWT alone for in-account participant join | Aligns with AviatorPass JWT (+ host ZAK from other path) |
| [OAuth scopes overview](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/) | Scopes bound API access; Security Review rejects unnecessary scopes | Do **not** add Create a Meeting / admin / master / division merely to clear validation |
| [OBF FAQ / transition](https://developers.zoom.us/docs/meeting-sdk/obf-faq/) | External-account join attribution may require OBF + `user:read:token` (enforcement timeline per Zoom) | Separate compliance track; **do not** add `user:read:token` unless implementing Classroom OAuth + OBF |

## 4. Can the existing app be configured without unnecessary OAuth scopes?

**Yes — with one important nuance.**

| Scope class | Keep / add? | Reason |
| --- | --- | --- |
| `meeting:write:meeting`, `:admin`, `:master`, division meeting scopes | **Do not add** | Reviewer already required removal of duplicate Create a Meeting admin/master; Classroom app does not create meetings |
| Empty scope list | **Blocked by portal** | “Select at least one scope” |
| `user:read:zak` only (user-managed) | **Only candidate** that matches Zoom’s Meeting SDK get-credentials guidance for user-managed MSDK apps | Satisfies portal minimum without reintroducing Create a Meeting |

**AviatorPass architecture conflict:** Production does **not** call `GET /users/{userId}/token?type=zak` using the Classroom Client ID’s OAuth access token. Host ZAK is obtained through the **Instructor OAuth** app / meeting start URL. Declaring `user:read:zak` on Classroom therefore satisfies Marketplace UI / documented MSDK scope pattern, but that scope is **not exercised** by Classroom Client ID OAuth today.

Therefore:

1. **Preferred (correctness-first):** Ask Zoom Marketplace Support whether a Meeting SDK–only General App that signs JWTs and obtains host ZAK via a **separate** user-managed OAuth app may publish with **zero** scopes, given reviewer-driven removal of Create a Meeting scopes.  
2. **If Support confirms a scope is mandatory / owner must clear the portal gate now:** Add **only** `user:read:zak` (label: View a user's Zoom Access Key / zak token). Provide honest testing instructions (below). Do **not** implement fake meeting-create scopes.

## 5. If a scope is required — purpose and testing instructions

### Candidate scope (only if Support / portal requires one)

| Field | Value |
| --- | --- |
| Marketplace label | User → **View a user's zak token** / View a user's Zoom Access Key |
| Granular scope id | `user:read:zak` |
| Management type | **User-managed** (not `:admin`, not `:master`) |
| Documented purpose (Zoom) | Allow an authorized user OAuth token on **this** app to call Get a user's token (`type=zak`) for Meeting SDK host/start flows |
| AviatorPass actual use on Classroom Client ID | **Not called today.** Host ZAK comes from separate Instructor OAuth / start_url. Participant join uses Meeting SDK JWT only. |
| Scope description text (suggested for Marketplace) | “Declared for Zoom Meeting SDK Marketplace compliance per Zoom Meeting SDK credential guidance (user-managed View ZAK). AviatorPass Classroom signs Meeting SDK JWTs with this app’s Client ID/Secret. Host ZAK for live classes is obtained via the separate AviatorPass for Zoom Instructor OAuth application, not via meeting create on this app.” |

### Scope-specific testing instructions (accurate — do not invent Classroom OAuth)

1. Confirm Production Scopes lists **only** `user:read:zak` (no Create a Meeting, no admin/master).  
2. Confirm Features → Embed → Meeting SDK is **on**; Meetings **surface** disabled; Custom Form removed.  
3. Instructor path (separate app): Connect Zoom on `/instructor/profile` with AviatorPass for Zoom (`Z0xA`), create/isolated class, open `/join/{classId}` as host — expect Meeting SDK embed + host controls when ZAK is available.  
4. Student path: separate browser, same `/join/{classId}` — participant JWT join (role 0); no host start URL.  
5. Do **not** claim that Classroom Client ID OAuth consent was used to mint the host ZAK unless that flow is later implemented.

### Do **not** add

- `meeting:write:meeting` / `meeting:write:meeting:admin` / `meeting:write:admin` / `meeting:master`
- Division / sub-account management scopes
- `user:read:token` **unless** owner approves implementing Classroom OAuth + OBF for external joins

## 6–8. Safety constraints (confirmed)

- Preserve Meeting SDK `ZOOM_CLIENT_*` (suffix `VGTQ`) — no credential rotation.  
- Do not change Instructor OAuth scopes/app (`Z0xA`) in this fix.  
- Do not disconnect or alter CEO S2S (`ceo@aviatorpass.com`).  
- Do not submit or recreate without owner approval.

## 9. Six reviewer notes + five previously resolved items

### Six October 22 functional notes (Classroom package)

| # | Note | Status after this investigation |
| --- | --- | --- |
| 1 | Duplicate Create a Meeting scopes | **Partially addressed / new portal conflict.** Removing Create a Meeting / admin/master was correct per reviewer. Empty Scopes now fails portal validation. Resolution = Support clarification and/or **only** `user:read:zak` — never re-add Create a Meeting. |
| 2 | Meetings surface | Still **owner manual** — disable if selected (product opens in AviatorPass `/join` only). |
| 3 | Custom Form | Still **owner manual** — remove if present. |
| 4 | Meeting SDK testing instructions | **Resolved in repo** (Classroom review + SDK docs). |
| 5 | Reviewer credentials | **Accounts verified**; passwords only in Zoom private Account credentials. |
| 6 | Consolidated English document | **Resolved in repo** (deploy/link still required for production URL). |

### Five previously resolved notes (do not reopen)

Treat the following as **already corrected** from prior review cycles; do **not** reverse them while fixing the empty-Scopes gate:

1. Removal of **duplicate Create a Meeting admin/master** scopes from the Classroom submission intent.  
2. Separation of **Instructor User-managed OAuth** from **Classroom Meeting SDK** credentials (no mixed Client IDs — production `credentialsMixed: false`).  
3. CEO / S2S kept as **platform booking host only** (not the Classroom Marketplace user flow).  
4. Classroom **does not open inside Zoom Meetings client** (Meetings surface should stay off).  
5. **Custom Form** unused and should stay removed.

## 10. Exact safe Marketplace configuration changes

### Do now (owner console — no code deploy required)

1. **AviatorPass Classroom for Zoom** → Features → Embed → **Meeting SDK ON**.  
2. Features → Surface → **Meetings OFF**.  
3. Remove **Custom Form** if present.  
4. Scopes: keep **Create a Meeting** (user/admin/master) **removed**.  
5. Open Zoom Marketplace Support ticket using the clarification text below **before** resubmitting.  
6. If Support confirms a scope is mandatory to clear “Select at least one scope”, add **only** `user:read:zak` (user-managed). Paste the scope description from §5.  
7. Do **not** recreate the app. Do **not** change Production Client ID/Secret.  
8. Do **not** submit until owner approval **and** reviewer classroom Connect Zoom / `/join/{classId}` proof (separate readiness blocker).

### Do not change

- Instructor OAuth app scopes (already: `user:read:user meeting:write:meeting meeting:read:meeting meeting:update:meeting meeting:delete:meeting`)  
- CEO S2S app / `ceo@aviatorpass.com`  
- Vercel `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` values  

## Zoom Marketplace Support — technical clarification (paste)

```text
Subject: Meeting SDK General App — Production Scopes requires “Select at least one scope” after removing unused Create a Meeting scopes

App name: AviatorPass Classroom for Zoom
App type: General App with Features → Embed → Meeting SDK enabled
Production Client ID suffix: VGTQ

Architecture:
- This app signs Meeting SDK JWTs (Client ID / Client Secret) so instructors and students join scheduled classes inside https://www.aviatorpass.com/join.
- This app does not create Zoom meetings and does not currently run a user OAuth consent flow on this Client ID.
- Meeting create and instructor personal Zoom authorization use a separate user-managed OAuth app: “AviatorPass for Zoom” (Client ID suffix Z0xA) with scopes limited to user:read:user and meeting:write/read/update/delete:meeting (no admin/master).
- Host ZAK for embedded host join is obtained via that separate Instructor OAuth / meeting start_url path, not via meeting:write scopes on the Meeting SDK app.

Review history:
- Zoom functional review asked us to remove duplicate Create a Meeting admin/master scopes. We removed those unnecessary scopes.
- Production Scopes now shows “Select at least one scope”, which blocks publication even though Meeting SDK JWT join does not require REST scopes at runtime.

Questions for Zoom Marketplace Support:
1) For a Meeting SDK–enabled General App that only signs JWTs and obtains host ZAK through a separate user-managed OAuth app, is an empty Scopes list allowed for publication?
2) If at least one scope is mandatory for the build flow, is the documented user-managed Meeting SDK scope “User → View a user's zak token” (user:read:zak) the correct minimal scope — even when ZAK is obtained via the separate Instructor OAuth app today?
3) Please confirm we should NOT re-add meeting:write:meeting or any admin/master/division Create a Meeting scopes on this Meeting SDK app.

We will not recreate the app (must preserve Production Meeting SDK credentials) and will not submit until we have your guidance.
```

## Impact if Support requires `user:read:zak`

| Area | Impact |
| --- | --- |
| Production JWT join | Unchanged (same Client ID/Secret) |
| Instructor OAuth / CEO S2S | Unchanged |
| Marketplace listing | Portal validation can proceed with one Meeting SDK–aligned scope |
| Security Review risk | Must disclose that Classroom Client ID does not call ZAK API today; otherwise reviewers may fail scope testing |
| Future OBF / `user:read:token` | Separate engineering decision; not part of this empty-Scopes unblock |

## Verdict

| Question | Answer |
| --- | --- |
| Is the app type wrong? | **No** — General App + Meeting SDK Embed is correct. Do not recreate. |
| Must we re-add Create a Meeting? | **No** — that would reverse a valid reviewer correction. |
| Is zero scopes viable in the portal today? | **No** — UI blocks with “Select at least one scope”. |
| Is zero scopes correct for JWT runtime? | **Yes** for signing JWTs; portal still requires a selection. |
| Safe unblock if Support requires a scope? | **Only** user-managed `user:read:zak`, with honest testing disclosure. |
| Ready to resubmit now? | **No** — awaiting Support confirmation (or owner-approved `user:read:zak`), plus prior readiness blockers (instructor Connect Zoom / working `/join/{classId}`). |
