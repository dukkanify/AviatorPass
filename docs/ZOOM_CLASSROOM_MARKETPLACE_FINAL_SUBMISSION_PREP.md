# AviatorPass Classroom for Zoom — Final Submission Preparation

**Date:** 28 October 2026 (Asia/Dubai)  
**Application:** AviatorPass Classroom for Zoom  
**App type:** General App · Features → Embed → Meeting SDK  
**Production Client ID suffix:** `VGTQ`  
**Verdict:** **NOT READY to submit** — Zoom Support written confirmation pending; reviewer classroom blocked; no unused scopes added.

**Restrictions honored:** no app recreate, no credential rotation, no CEO disconnect, no customer meeting changes, no unnecessary permissions, no Marketplace submit without owner approval.

---

## 1. Official Zoom support clarification / case number

| Field | Status |
| --- | --- |
| Support case number | **Not opened** — this Cloud Agent environment cannot authenticate to Zoom Marketplace / Premier Developer Support as the app owner |
| Official functional-review contact (Zoom docs) | `integration.testers@zoom.us` ([Check review status](https://developers.zoom.us/docs/build-flow/check-review-status/), [Supporting published apps](https://developers.zoom.us/docs/distribute/published-apps/support/)) |
| Premier Developer Support portal | Requires owner/admin Zoom login + PDS entitlement ([KB0075370](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0075370)) |
| Action required | **Owner** sends the email below from the Marketplace **Developer Contact** inbox and records the case / thread ID |

### Owner email — send to `integration.testers@zoom.us`

**Subject:** AviatorPass Classroom for Zoom (Meeting SDK, Client ID …VGTQ) — Production Scopes “Select at least one scope” after removing unused Create a Meeting scopes

```text
Hello Zoom Marketplace / Integration Testers team,

App name: AviatorPass Classroom for Zoom
App type: General App with Features → Embed → Meeting SDK enabled
Production Client ID suffix: VGTQ
Landing: https://www.aviatorpass.com/join
Docs: https://www.aviatorpass.com/integrations/zoom

Architecture (three separate integrations — credentials are not mixed):
1) This Classroom Meeting SDK app signs Meeting SDK JWTs with its Client ID/Secret. It does not create Zoom meetings on this Client ID and does not currently implement user-managed OAuth on this Client ID.
2) Separate user-managed OAuth app “AviatorPass for Zoom” (Client ID suffix Z0xA) handles instructor Connect Zoom and meeting create/read/update/delete with user-level scopes only (no admin/master Create a Meeting).
3) Separate Server-to-Server OAuth (platform host ceo@aviatorpass.com) is unrelated to this Marketplace Classroom submission and must remain unchanged.

Review history:
- Functional review asked us to remove duplicate Create a Meeting admin/master scopes. We removed those unnecessary scopes.
- Production Scopes now shows: “Select at least one scope”.
- We will not reintroduce Create a Meeting / admin / master / division / unused meeting scopes merely to clear validation.
- We will not add user:read:zak merely to bypass validation unless Zoom confirms it is mandatory for this architecture.
- We must preserve the existing application and Production Meeting SDK credentials (no recreate / no Client ID rotation).

Questions requiring written confirmation:
1) Can a Meeting SDK-enabled General App be published without OAuth scopes when it only signs Meeting SDK JWTs?
2) If the Marketplace build flow requires a scope, which exact scope is appropriate for this architecture?
3) Is user:read:zak acceptable when the Classroom application does not currently call the ZAK API itself (host ZAK is obtained via the separate Instructor OAuth app / meeting start_url)?
4) Can the mandatory scope validation (“Select at least one scope”) be removed or resolved without adding unused permissions?
5) Can the existing application and Production Meeting SDK credentials be preserved?
6) Are any additional changes required to satisfy the functional reviewer for this Meeting SDK embed use case?

Relevant Zoom documentation we are following:
- Meeting SDK get credentials / auth (JWT; user-managed ZAK scope documented for apps that retrieve ZAK via that app’s OAuth)
- Meeting SDK feature review: least privilege; scopes requested in the build flow are tested
- Note that for an SDK app that does not need end-user authorization but needs approval to join other accounts’ meetings, OAuth redirect URL may not be required

Please reply with written guidance. We will not submit until we have Zoom’s confirmation and owner approval.

Thank you,
AviatorPass / Marketplace developer contact
support@aviatorpass.com
```

**After sending:** record date/time (Asia/Dubai), support case or email thread ID, and Zoom’s written answers into this document §1 table.

---

## 2. Verified Marketplace scope configuration (current)

| Setting | Required state | Verified how | Current status |
| --- | --- | --- | --- |
| Meeting SDK Embed | ON | Architecture + production JWT pair `VGTQ` valid | **Owner confirm in portal** (product uses Embed JWT) |
| Meetings Surface | OFF | Product opens only in AviatorPass `/join` | **Owner confirm in portal** |
| Custom Form | Removed | Unused in product | **Owner confirm in portal** |
| Create a Meeting user/admin/master | Removed / must stay removed | Reviewer note + least privilege | **Owner confirm empty of Create a Meeting** |
| Other unused meeting / division / token scopes | Do not add | Owner rule + Zoom least privilege | **None added by this agent** |
| `user:read:zak` | **Not added** | Awaiting Zoom written confirmation | **Deferred — do not add to clear validation alone** |
| Production Client ID/Secret (`VGTQ`) | Unchanged | `/api/zoom/status` pair valid | **PASS** |
| Instructor OAuth (`Z0xA`) | Unchanged | scopes string without admin create; `credentialsMixed: false` | **PASS — do not modify** |
| CEO S2S host | Unchanged | `hostZak.ready` / `ceo@aviatorpass.com` | **PASS — do not disconnect** |

**Scope decision (locked until Zoom replies):** Do **not** add `user:read:zak` or any other scope merely because the portal shows “Select at least one scope.” If Zoom confirms a specific scope is mandatory, obtain **owner approval** before changing authorization architecture, then document the requirement and whether a legitimate OAuth implementation is needed.

---

## 3. Six functional review notes — status

| # | Note | Status | Evidence / remaining action |
| --- | --- | --- | --- |
| 1 | Duplicate Create a Meeting scopes | **OPEN — portal conflict** | Create a Meeting correctly removed; empty Scopes blocked by “Select at least one scope”. Awaiting Zoom Support. Do not re-add Create a Meeting. |
| 2 | Meetings surface | **OPEN — owner console** | Disable Meetings surface if selected. |
| 3 | Custom Form | **OPEN — owner console** | Remove if present. |
| 4 | Meeting SDK testing instructions | **Resolved in repo** | `/integrations/zoom` live; classroom review package in repo (production page deploy pending — 404 at last probe). |
| 5 | Reviewer credentials | **Accounts verified** | Instructor + student logins OK; passwords only in Zoom private Account credentials (owner paste). |
| 6 | Consolidated English document | **Resolved in repo** | Package + readiness + scope resolution docs; production URL pending deploy. |

---

## 4. Five previously resolved notes — do not reopen

| # | Prior correction | Status |
| --- | --- | --- |
| A | Remove duplicate Create a Meeting **admin/master** scopes from Classroom intent | **Keep resolved** — do not restore |
| B | Separate Instructor OAuth credentials from Meeting SDK (`Z0xA` ≠ `VGTQ`) | **Keep resolved** — `credentialsMixed: false` |
| C | CEO / S2S is platform booking host only — not Classroom Marketplace user flow | **Keep resolved** — do not disconnect |
| D | Classroom does not open inside Zoom Meetings client | **Keep resolved** — Meetings surface stays off |
| E | Custom Form unused | **Keep resolved** — stays removed |

---

## 5. Reviewer account and classroom readiness

**Probe:** 28 October 2026 ~13:16 Asia/Dubai (`/opt/cursor/artifacts/classroom-final-submission-prep-probe.json`)

| Check | Result |
| --- | --- |
| Meeting SDK `VGTQ` credential pair | PASS |
| Instructor OAuth `Z0xA` separate | PASS |
| CEO `hostZak.ready` | PASS (`ceo@aviatorpass.com`) |
| Reviewer instructor login | PASS |
| Reviewer student login | PASS |
| `personalZoomReady` | **false** |
| `POST /api/admin/zoom/reviewer-classroom` | **409** `oauth_not_connected` |
| Working `/join/{classId}` | **MISSING** |
| Host/student embedded Meeting SDK E2E | **NOT RUN** — do not claim success |
| Real two-way A/V | **NOT CLAIMED** |

**Exact owner authorization step (required — do not bypass):**

1. Sign in as `zoom.reviewer.instructor@aviatorpass.com`  
2. Open `https://www.aviatorpass.com/instructor/profile`  
3. **Connect Zoom** with a dedicated personal Zoom user (**not** `ceo@aviatorpass.com`, **not** a customer account) using **AviatorPass for Zoom** (`Z0xA`)  
4. Confirm Connected + `personalZoomReady: true`  
5. Super Admin `POST /api/admin/zoom/reviewer-classroom` (or instructor creates the isolated class)  
6. Test host + student on `https://www.aviatorpass.com/join/{classId}`

---

## 6. Remaining manual owner actions

1. Email `integration.testers@zoom.us` using §1 text; record case/thread ID and Zoom’s written answers.  
2. Confirm portal: Meeting SDK ON; Meetings surface OFF; Custom Form removed; Create a Meeting gone.  
3. **Do not** add scopes until Zoom confirms; then obtain owner approval before any architecture change.  
4. Paste reviewer passwords into Zoom **private** Account credentials only.  
5. Complete Connect Zoom + isolated reviewer classroom + host/student proof.  
6. Deploy classroom review docs page so `/integrations/zoom-classroom-review` is 200; link in Marketplace docs.  
7. Paste final reviewer response (§7) into Zoom review notes **only after** owner approval to submit.  
8. Submit Marketplace **only** after owner explicit approval.

---

## 7. Exact final reviewer response (paste when owner approves submit)

```text
AviatorPass Classroom for Zoom — Marketplace reviewer response
Updated: 28 October 2026 (Asia/Dubai)

APPLICATION
General App with Features → Embed → Meeting SDK enabled.
Direct Landing URL: https://www.aviatorpass.com/join
Documentation: https://www.aviatorpass.com/integrations/zoom
Functional review package: https://www.aviatorpass.com/integrations/zoom-classroom-review
Support: support@aviatorpass.com
Production Meeting SDK Client ID suffix: VGTQ (credentials preserved; app not recreated).

ARCHITECTURE (credentials not mixed)
1) AviatorPass Classroom for Zoom — Meeting SDK JWT signing only on this Client ID. Does not create meetings via this app’s OAuth credentials. Does not currently implement user-managed OAuth on this Client ID.
2) AviatorPass for Zoom — separate user-managed OAuth (Client ID suffix Z0xA) for instructor Connect Zoom and meeting create/read/update/delete (user-level scopes only; no admin/master Create a Meeting).
3) CEO Server-to-Server OAuth — platform host ceo@aviatorpass.com only. Unchanged. Not part of this Classroom Marketplace user flow.

SCOPES / REVIEWER NOTE ON CREATE A MEETING
Per Zoom functional review, duplicate Create a Meeting admin/master scopes were removed from this Classroom app and will not be reintroduced.
Production Scopes then showed “Select at least one scope”. We have contacted Zoom Marketplace Support (integration.testers@zoom.us) for written confirmation whether a Meeting SDK JWT-only General App may publish with zero OAuth scopes, and which exact scope (if any) is mandatory for this architecture.
We will not add unused Create a Meeting, admin, master, division, or token/ZAK scopes merely to clear portal validation.
If Zoom confirms a specific scope is mandatory, we will document that requirement and obtain owner approval before any authorization-architecture change.

MEETINGS SURFACE / CUSTOM FORM
Product opens inside AviatorPass browser pages (/join), not inside the Zoom Meetings client. Meetings surface should remain disabled. Custom Form is unused and should remain removed. Embed → Meeting SDK remains enabled.

REVIEWER ACCOUNTS (passwords only in Zoom private Account credentials)
Instructor: Riley Okonkwo — zoom.reviewer.instructor@aviatorpass.com
Student: Jordan Hale — zoom.reviewer.student@aviatorpass.com

PREREQUISITE FOR ISOLATED CLASSROOM
Reviewer instructor must Connect Zoom on https://www.aviatorpass.com/instructor/profile using a dedicated personal Zoom user (not ceo@aviatorpass.com). Until personalZoomReady is true, classroom create returns HTTP 409 oauth_not_connected by design. We do not bypass instructor authorization or meeting ownership.

TEST WORKFLOW (after Connect Zoom succeeds)
1) Instructor creates/isolated class (or Super Admin POST /api/admin/zoom/reviewer-classroom) and enrolls the student reviewer.
2) Host: https://www.aviatorpass.com/join/{classId} — embedded Meeting SDK host controls when join succeeds.
3) Student (separate browser): same /join/{classId} — participant join (role 0); no host start URL.
4) Controls: Mute / Stop Video / Participants / Leave Class as provided by the embedded SDK.
5) Real two-way mic/camera confirmation is a manual reviewer check on physical devices; automated environments do not claim A/V pass.

EXPECTED RESULTS (verified unless noted)
- Meeting SDK credential pair VGTQ: PASS
- Instructor OAuth Z0xA separate from Meeting SDK and S2S: PASS
- CEO host intact: PASS — do not disconnect
- Reviewer AviatorPass logins: PASS
- Isolated reviewer classroom /join/{classId}: PENDING Connect Zoom (409 oauth_not_connected until then)
- Embedded host/student join: NOT claimed until classroom exists
- Create a Meeting scopes on Classroom app: intentionally absent pending Zoom Support written guidance on empty Scopes validation
```

---

## 8. Final readiness verdict

| Criterion | Result |
| --- | --- |
| Architecture separation preserved | **PASS** |
| No unnecessary scopes added | **PASS** |
| Create a Meeting not reintroduced | **PASS** |
| Credentials / CEO / customer meetings untouched | **PASS** |
| Zoom Support written confirmation | **PENDING (owner must send §1)** |
| Portal scope configuration justified by Zoom confirmation | **PENDING** |
| Reviewer classroom E2E | **FAIL / BLOCKED** (`oauth_not_connected`) |
| Marketplace submit | **NOT APPROVED / NOT PERFORMED** |

### Overall: **NOT READY for Marketplace submission**

Acceptance criterion not met until: (1) Zoom’s written scope guidance is recorded, (2) Marketplace scopes match that guidance without unused permissions, (3) reviewer classroom exists and host/student join is verified, (4) owner explicitly approves submit.
