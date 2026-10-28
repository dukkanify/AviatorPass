/**
 * Consolidated English functional-review package for
 * AviatorPass Classroom for Zoom (Meeting SDK Marketplace app).
 * No passwords, secrets, tokens, or ZAK values.
 */

export const CLASSROOM_REVIEW_PATH = "/integrations/zoom-classroom-review";

export const CLASSROOM_REVIEW_TITLE =
  "AviatorPass Classroom for Zoom — Marketplace Functional Review";

export const CLASSROOM_REVIEW_UPDATED =
  "28 October 2026 (Asia/Dubai) — final readiness: NOT READY for resubmission";

/** Marketplace resubmission readiness — verified against production; no invented results. */
export const CLASSROOM_REVIEW_READINESS = {
  verdict: "NOT_READY" as const,
  label: "NOT READY for Marketplace resubmission",
  checkedAtLabel: "28 October 2026 (Asia/Dubai)",
  blockers: [
    "Reviewer instructor personalZoomReady is false → POST /api/admin/zoom/reviewer-classroom returns HTTP 409 oauth_not_connected.",
    "No isolated reviewer classroom exists; there is no working /join/{classId} for reviewers.",
    "Embedded host/student Meeting SDK join was not run.",
    "Public /integrations/zoom-classroom-review returns 404 until this package is deployed to production.",
    "Zoom Marketplace portal scopes, Meetings surface, and Custom Form cannot be verified from AviatorPass — owner console confirmation required.",
    "Real two-way audio/video is not claimed as passed.",
  ],
  ceoPlatformProvisionSupported: false,
  ceoPlatformProvisionReason:
    "Production live classes require the instructor’s personal Zoom OAuth. createMeetingForClass never falls back to ceo@aviatorpass.com / S2S. Reviewer classroom also rejects shared_platform_zoom. Do not bypass authorization.",
} as const;

export type ClassroomReviewSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export const CLASSROOM_REVIEW_SECTIONS: ClassroomReviewSection[] = [
  {
    heading: "1. Application overview",
    paragraphs: [
      "AviatorPass Classroom for Zoom embeds a scheduled AviatorPass live class in the browser through the Zoom Meeting SDK.",
      "AviatorPass is an independent aviation training platform. Zoom Video Communications does not own, operate, or endorse AviatorPass.",
      "This Marketplace application does not create Zoom meetings and does not run a user OAuth consent flow. Meeting creation belongs to the separate Instructor User-managed OAuth application (AviatorPass for Zoom). Platform booking meetings use a third Server-to-Server credential set owned by the platform CEO Zoom account and must not be disconnected for this review.",
    ],
    bullets: [
      "Marketplace display name: AviatorPass Classroom for Zoom",
      "Direct Landing URL: https://www.aviatorpass.com/join",
      "Documentation URL: https://www.aviatorpass.com/integrations/zoom",
      "This functional review document: https://www.aviatorpass.com/integrations/zoom-classroom-review",
      "Support: support@aviatorpass.com",
      "Production Meeting SDK Client ID suffix (last four): VGTQ — credential pair validated on production (credentialPairValid true).",
    ],
  },
  {
    heading: "2. Application architecture",
    paragraphs: [
      "Keep three Zoom credential paths separate. Do not mix Client IDs, secrets, scopes, or Landing URLs.",
    ],
    bullets: [
      "AviatorPass Classroom for Zoom (this app) — Meeting SDK JWT signing with ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET. Opens /join and /join/{classId} inside AviatorPass.",
      "AviatorPass for Zoom — Instructor User-managed OAuth with ZOOM_INSTRUCTOR_* (Production Client ID 7z2krfWYQWCi20C0FRZ0xA, suffix Z0xA). Landing /instructor/profile. Creates/updates/deletes meetings on the instructor’s personal Zoom user.",
      "CEO Server-to-Server OAuth — platform booking host only (account email ceo@aviatorpass.com). Not a Marketplace user-facing app under this Classroom review. Do not disconnect or reassign it.",
      "Live class meeting creation in production requires the instructor’s personalZoomReady flag. It never falls back to ceo@aviatorpass.com.",
    ],
  },
  {
    heading: "3. Required scopes and testing instructions",
    paragraphs: [
      "AviatorPass Classroom for Zoom signs a Meeting SDK JSON Web Token that names the meeting number and role (participant 0 or host 1). Product code does not run user OAuth on the Classroom Client ID.",
      "Zoom Marketplace Production Scopes shows “Select at least one scope” when the list is empty. That is a portal validation gate. Meeting SDK JWT signing does not require REST scopes at runtime.",
      "Do not re-add Create a Meeting user/admin/master scopes on this Classroom app. Those were correctly removed after Zoom’s functional review.",
      "Official Meeting SDK credential guidance for user-managed apps documents User → View a user's zak token (user:read:zak) as the Meeting SDK–oriented scope. Ask Zoom Marketplace Support whether zero scopes are allowed for a JWT-only Meeting SDK app that obtains host ZAK via a separate Instructor OAuth app. If Support confirms a scope is mandatory, add only user:read:zak — never meeting create/admin/master.",
      "Scopes that belong only to AviatorPass for Zoom (Instructor OAuth) — not this Classroom app:",
    ],
    bullets: [
      "user:read:user — Purpose: load Zoom identity after Connect Zoom. Test on /instructor/profile after Connect Zoom.",
      "meeting:write:meeting — Purpose: POST /users/me/meetings for the connected instructor. Keep the user scope; remove meeting:write:meeting:admin / master duplicates on the Instructor OAuth app.",
      "meeting:read:meeting — Purpose: GET /meetings/{id} during sync and join preparation.",
      "meeting:update:meeting — Purpose: PATCH /meetings/{id} when a class is rescheduled.",
      "meeting:delete:meeting — Purpose: DELETE /meetings/{id} when a class is cancelled.",
      "Rejected on Instructor OAuth (never enable for AviatorPass live classes): meeting:write:meeting:admin, meeting:write:admin, meeting:master.",
      "Classroom Meeting SDK runtime: POST /api/zoom/in-app-session returns a Meeting SDK signature without a Zoom OAuth consent screen for this app. Host ZAK today comes from the separate Instructor OAuth / start_url path.",
      "Operator resolution plan: docs/ZOOM_CLASSROOM_MARKETPLACE_SCOPE_RESOLUTION.md",
    ],
  },
  {
    heading: "4. Reviewer prerequisites",
    paragraphs: [
      "Both reviewer AviatorPass accounts must be active with complete profiles. Passwords are delivered only through Zoom Marketplace private Account credentials — never on this page, GitHub, or public listing text.",
      "Final readiness (28 October 2026 Asia/Dubai): NOT READY for Marketplace resubmission. An isolated reviewer classroom cannot be created through the CEO / Server-to-Server platform meeting workflow. Personal instructor Zoom authorization is required by design and must not be bypassed.",
    ],
    bullets: [
      "Instructor — Riley Okonkwo — zoom.reviewer.instructor@aviatorpass.com",
      "Student — Jordan Hale — zoom.reviewer.student@aviatorpass.com",
      "Use a fresh browser (or separate profiles) for instructor and student.",
      "Required before any working classroom URL: Connect Zoom on /instructor/profile with a dedicated personal Zoom user that is not ceo@aviatorpass.com and not a customer Zoom account. Confirm Connected and personalZoomReady true.",
      "Verified 28 October 2026 Asia/Dubai: both AviatorPass reviewer logins succeed. personalZoomReady is still false. POST /api/admin/zoom/reviewer-classroom returns HTTP 409 oauth_not_connected. No reviewer classId exists yet.",
      "Working classroom URL: unavailable until the prerequisite above succeeds. After create, use https://www.aviatorpass.com/join/{classId} from the API response joinPath.",
      "Marketplace Features for this Classroom app: disable Meetings surface (the product does not open inside the Zoom Meetings client). Remove Custom Form (unused).",
      "Features → Embed → Meeting SDK must be enabled on this Classroom application.",
    ],
  },
  {
    heading: "5. Instructor test workflow",
    paragraphs: [
      "Complete personal Zoom authorization first. Without it, live-class creation is blocked by design.",
    ],
    bullets: [
      "Open https://www.aviatorpass.com/login and sign in as zoom.reviewer.instructor@aviatorpass.com.",
      "Open https://www.aviatorpass.com/instructor/profile.",
      "Choose Connect Zoom. Expect redirect to https://zoom.us/oauth/authorize for AviatorPass for Zoom (Client ID 7z2krfWYQWCi20C0FRZ0xA), callback https://www.aviatorpass.com/api/integrations/zoom/callback, signed state, no scope query parameter by default.",
      "Sign in on Zoom with a dedicated personal Zoom user and approve. Expect return to /instructor/profile with Connected and personalZoomReady true.",
      "Create the isolated reviewer classroom: Super Admin may call POST /api/admin/zoom/reviewer-classroom (creates only the reviewer class; does not modify customer meetings), or the instructor creates a short class titled for example Marketplace reviewer classroom — ATPL meteorology and enrolls zoom.reviewer.student@aviatorpass.com.",
      "Open https://www.aviatorpass.com/join, select that class (or open /join/{classId}).",
      "Start the embedded meeting as host. Expect Meeting SDK controls (Mute, Stop Video, Participants, Leave Class) and a HOST indicator when join succeeds.",
      "End with Leave Class. That closes the browser session; it does not delete the AviatorPass account.",
    ],
  },
  {
    heading: "6. Student test workflow",
    paragraphs: ["Use a separate fresh browser session from the instructor."],
    bullets: [
      "Sign in as zoom.reviewer.student@aviatorpass.com.",
      "Open https://www.aviatorpass.com/join and select the same class, or open /join/{classId}.",
      "Expect embedded Meeting SDK join as a participant (role 0). The student must not receive a host start URL or ZAK.",
      "Open https://www.aviatorpass.com/instructor/profile. Expect /access-denied.",
      "Leave Class ends the student browser session only.",
    ],
  },
  {
    heading: "7. Meeting SDK host and participant workflow",
    paragraphs: [
      "When the class has a numeric Zoom meeting number, AviatorPass calls POST /api/zoom/in-app-session. The response includes mode sdk, a signature, and for the host a hostSignature plus ZAK when available.",
      "Audio and video: reviewers should enable microphone and camera in the browser when prompted and confirm two-way media between instructor and student on real devices when available.",
      "AviatorPass does not claim that automated Cloud Agent runs have completed real two-way human audio/video validation. Treat live mic/camera confirmation as a reviewer manual check.",
    ],
    bullets: [
      "Host expected: role 1 when ZAK is present; Mute / Stop Video / Share Screen / Leave Class visible.",
      "Participant expected: role 0; no host start URL; can use mute/video controls appropriate to participant permissions.",
      "Troubleshooting Zoom error 3712: Meeting SDK Client ID and Secret mismatch or Embed disabled.",
      "Troubleshooting Zoom error 3000: host Zoom user already in another meeting — Super Admin clear-live recovery ends live/ghost sessions without disconnecting CEO OAuth.",
      "Troubleshooting HTTP 409 Please connect your Zoom account / oauth_not_connected: Instructor OAuth not connected; Classroom Meeting SDK cannot create the meeting.",
    ],
  },
  {
    heading: "8. Expected results",
    paragraphs: [
      "Verified on production as of 28 October 2026 Asia/Dubai unless noted. Overall Marketplace resubmission readiness: NOT READY.",
    ],
    bullets: [
      "Reviewer instructor and student AviatorPass logins: PASS.",
      "Meeting SDK credential pair (suffix VGTQ): PASS (credentialPairValid true).",
      "Instructor OAuth Production Client ID suffix Z0xA separate from Meeting SDK VGTQ and S2S (uX3Q): PASS (credentialsMixed false).",
      "CEO platform host (ceo@aviatorpass.com) hostZak.ready: PASS — do not disconnect; not used to host reviewer live classes.",
      "Classroom Meeting SDK JWT path only (no user OAuth scopes in product): PASS.",
      "CEO / S2S provisioning of reviewer classroom: NOT SUPPORTED by design — do not bypass.",
      "Isolated reviewer classroom create: BLOCKED (HTTP 409 oauth_not_connected). Working /join/{classId}: MISSING.",
      "Embedded host/participant join on reviewer classroom: NOT RUN.",
      "Real two-way audio/video between humans: NOT CLAIMED as passed.",
      "Student denied instructor routes: PASS (307 → /access-denied).",
      "Customer meetings / CEO credentials / existing Zoom connections: unchanged by this readiness review.",
    ],
  },
  {
    heading: "9. Known approval-dependent restrictions",
    paragraphs: [
      "Zoom may require the Classroom Meeting SDK application to be published or activated before Production Meeting SDK credentials work for all join paths. Production status detail notes that Development credentials may be required until publish/activation.",
      "External Marketplace reviewer experience while the app is unpublished follows Zoom’s submit/publish process. Owner Local Test and allow-listed Zoom users can still exercise Instructor OAuth authorize when configured.",
      "Disabling the Meetings surface and removing Custom Form / unused OAuth scopes are Zoom Marketplace console actions. They are not applied by deploying AviatorPass code.",
    ],
  },
  {
    heading: "10. Reviewer support contact",
    paragraphs: [
      "Email support@aviatorpass.com for Marketplace review assistance. For legal identity questions use info@aviatorpass.com.",
      "Do not request passwords on public channels. The platform owner pastes temporary reviewer passwords only into Zoom’s private Account credentials field.",
    ],
  },
];

/** Six October 22 functional notes mapped for operators (no secrets). */
export const CLASSROOM_REVIEW_NOTE_MATRIX = [
  {
    id: 1,
    title: "Duplicate Create a Meeting scopes",
    concern:
      "Marketplace showed duplicate Create a Meeting scopes (user plus admin/master). After removal, Production Scopes shows Select at least one scope.",
    current:
      "Classroom product uses Meeting SDK JWT only. Create a Meeting scopes correctly removed. Empty Scopes list fails Zoom portal validation. Instructor OAuth keeps meeting:write:meeting and rejects admin/master.",
    correction:
      "Do not re-add Create a Meeting. Ask Zoom Marketplace Support whether JWT-only Meeting SDK apps may publish with zero scopes. If a scope is mandatory, add only user-managed user:read:zak per Zoom Meeting SDK get-credentials guidance, with honest testing disclosure. Keep Instructor OAuth scopes unchanged.",
    evidence:
      "docs/ZOOM_CLASSROOM_MARKETPLACE_SCOPE_RESOLUTION.md; Zoom Meeting SDK get-credentials (View a user's zak token); production Meeting SDK VGTQ JWT path; instructor scopes without admin create.",
    status: "open_manual_marketplace" as const,
    manualAction:
      "Owner sends Support clarification (or adds only user:read:zak if Support confirms). Never re-add Create a Meeting admin/master. Do not recreate the app.",
  },
  {
    id: 2,
    title: "Meetings surface",
    concern: "Application may claim the Zoom Meetings in-product surface incorrectly.",
    current:
      "Product opens only inside AviatorPass browser pages (/join). It does not open inside the Zoom Meetings client UI.",
    correction:
      "Zoom Marketplace → AviatorPass Classroom for Zoom → Features → Surface → disable Meetings if selected.",
    evidence: "Production routes /join and /join/{classId}; meeting-sdk-public and this document.",
    status: "open_manual_marketplace" as const,
    manualAction:
      "Owner disables Meetings surface in Marketplace. No AviatorPass embed code change required.",
  },
  {
    id: 3,
    title: "Custom Form",
    concern: "Unused Custom Form remains on the submission.",
    current: "AviatorPass does not render Zoom Custom Form for registration or intake.",
    correction:
      "Zoom Marketplace → Features / Custom Form → remove or disable. Leave AviatorPass APIs unchanged.",
    evidence: "No Custom Form integration in AviatorPass Zoom services or classroom UI.",
    status: "open_manual_marketplace" as const,
    manualAction: "Owner removes Custom Form in Marketplace.",
  },
  {
    id: 4,
    title: "Meeting SDK testing instructions",
    concern: "Reviewers need detailed host/participant embedded Meeting SDK steps.",
    current:
      "Public docs at /integrations/zoom plus this consolidated page at /integrations/zoom-classroom-review.",
    correction:
      "Publish detailed instructor, student, host/participant, A/V, controls, end-meeting, and troubleshooting steps (this document).",
    evidence: "CLASSROOM_REVIEW_SECTIONS 5–8; production URLs verified.",
    status: "resolved_in_repo" as const,
    manualAction:
      "Owner pastes documentation URL into Marketplace submission fields after approval to publish text.",
  },
  {
    id: 5,
    title: "Reviewer test credentials",
    concern: "Reviewer instructor and student accounts must work; passwords private.",
    current:
      "Both accounts login successfully on production (verified 28 October 2026). Passwords live only in the owner private store for paste into Zoom Account credentials.",
    correction:
      "Owner pastes emails and temporary passwords into Zoom Marketplace private Account credentials only. Never into public listing or Git.",
    evidence:
      "Production login probe: instructor role instructor OK; student role student OK. Passwords not printed in docs.",
    status: "resolved_accounts_pending_zoom_paste" as const,
    manualAction: "Owner pastes credentials into Zoom private field before resubmit.",
  },
  {
    id: 6,
    title: "Consolidated review documentation",
    concern: "Need one English document covering architecture, scopes, workflows, limits, support.",
    current: "This page and docs/ZOOM_CLASSROOM_MARKETPLACE_FUNCTIONAL_REVIEW.md.",
    correction: "Ship consolidated Classroom-focused functional review package.",
    evidence: "Public URL /integrations/zoom-classroom-review",
    status: "resolved_in_repo" as const,
    manualAction:
      "Owner links this URL in Marketplace documentation fields; do not submit until owner approves.",
  },
] as const;

/**
 * Exact English text for Zoom Marketplace reviewer response fields.
 * No passwords, secrets, tokens, or ZAK values.
 */
export const CLASSROOM_REVIEW_ZOOM_PASTE_TEXT = `AviatorPass Classroom for Zoom — Marketplace reviewer response
Updated: 28 October 2026 (Asia/Dubai)
READINESS: NOT READY for Marketplace resubmission until the reviewer instructor completes Connect Zoom and an isolated /join/{classId} is verified.

APPLICATION
AviatorPass Classroom for Zoom embeds a scheduled AviatorPass live class in the browser through the Zoom Meeting SDK.
Direct Landing URL: https://www.aviatorpass.com/join
Documentation: https://www.aviatorpass.com/integrations/zoom
Functional review package: https://www.aviatorpass.com/integrations/zoom-classroom-review
Support: support@aviatorpass.com

AviatorPass is independent of Zoom Video Communications. This Marketplace app does not create Zoom meetings and does not run a user OAuth consent flow.

SEPARATE INTEGRATIONS (do not mix)
1) AviatorPass Classroom for Zoom — Meeting SDK JWT signing only (Client ID suffix VGTQ). Opens /join inside AviatorPass.
2) AviatorPass for Zoom — Instructor User-managed OAuth (Production Client ID 7z2krfWYQWCi20C0FRZ0xA, suffix Z0xA). Landing /instructor/profile. Creates/updates/deletes meetings on the connected instructor’s personal Zoom user.
3) CEO Server-to-Server OAuth — platform booking host only (ceo@aviatorpass.com). Not part of this Classroom Marketplace review. Do not disconnect it.

SCOPES
Classroom Meeting SDK runtime: Meeting SDK JWT only (participant 0 / host 1). Product code does not run user OAuth on this Client ID.
Create a Meeting user/admin/master scopes were correctly removed per Zoom review. An empty Production Scopes list now shows “Select at least one scope” (portal validation).
Do NOT re-add Create a Meeting. Preferred: ask Zoom Marketplace Support whether JWT-only Meeting SDK apps may publish with zero scopes.
If Support confirms a scope is mandatory, add only user-managed user:read:zak (User → View a user's zak token) per Zoom Meeting SDK get-credentials guidance — with honest disclosure that host ZAK today comes from the separate Instructor OAuth app.
Instructor OAuth (separate app) retains only:
- user:read:user — identity after Connect Zoom
- meeting:write:meeting — POST /users/me/meetings
- meeting:read:meeting — GET /meetings/{id}
- meeting:update:meeting — PATCH /meetings/{id}
- meeting:delete:meeting — DELETE /meetings/{id}
Rejected / not used: meeting:write:meeting:admin, meeting:write:admin, meeting:master (no sub-account management).

MEETINGS SURFACE
The product opens only inside AviatorPass browser pages (/join, /join/{classId}). It does not open inside the Zoom Meetings client. Meetings surface should be disabled for this Classroom app.

CUSTOM FORM
Unused. AviatorPass does not depend on Zoom Custom Form. Remove it from the Marketplace submission.

REVIEWER ACCOUNTS (passwords only in Zoom private Account credentials)
Instructor: Riley Okonkwo — zoom.reviewer.instructor@aviatorpass.com
Student: Jordan Hale — zoom.reviewer.student@aviatorpass.com
Verified 28 October 2026 Asia/Dubai: both AviatorPass logins succeed. Passwords are pasted only into Zoom’s private Account credentials field — never into public listing text or GitHub.

PREREQUISITE — personal instructor authorization is required (CEO / S2S cannot provision this classroom)
Live classes always host on the instructor’s personal Zoom OAuth account. Production never falls back to ceo@aviatorpass.com / Server-to-Server for reviewer or customer live classes. Do not bypass this check.
Before an isolated reviewer classroom can be created, the instructor must Connect Zoom on https://www.aviatorpass.com/instructor/profile using a dedicated personal Zoom user that is NOT ceo@aviatorpass.com and NOT a customer Zoom account.
Until personalZoomReady is true, POST /api/admin/zoom/reviewer-classroom returns HTTP 409 oauth_not_connected by design.
Working classroom URL: none yet. After Connect Zoom succeeds, create the classroom and use https://www.aviatorpass.com/join/{classId}.

INSTRUCTOR WORKFLOW
1. Sign in at https://www.aviatorpass.com/login as zoom.reviewer.instructor@aviatorpass.com
2. Open https://www.aviatorpass.com/instructor/profile → Connect Zoom → approve AviatorPass for Zoom (Client ID 7z2krfWYQWCi20C0FRZ0xA)
3. Create an isolated short class (or Super Admin creates the reviewer classroom after Connect Zoom) and enroll zoom.reviewer.student@aviatorpass.com
4. Open https://www.aviatorpass.com/join (or /join/{classId}) and start as host
5. Expect embedded Meeting SDK controls (Mute, Stop Video, Participants, Leave Class) and HOST when join succeeds
6. Leave Class ends the browser session only; AviatorPass account remains

STUDENT WORKFLOW
1. Separate browser → sign in as zoom.reviewer.student@aviatorpass.com
2. Open the same /join/{classId}
3. Expect participant join (role 0); no host start URL / ZAK
4. /instructor/profile → Access denied
5. Leave Class ends student browser session only

AUDIO / VIDEO / CONTROLS
Reviewers should enable mic and camera when prompted and confirm two-way media on real devices when available.
AviatorPass does NOT claim that automated Cloud Agent runs completed real two-way human audio/video validation. Treat live mic/camera confirmation as a manual reviewer check.

EXPECTED RESULTS (verified unless noted) — overall NOT READY
- Reviewer instructor + student AviatorPass logins: PASS (28 Oct 2026 Asia/Dubai)
- Meeting SDK credential pair (suffix VGTQ): PASS
- Instructor OAuth (suffix Z0xA) separate from Meeting SDK (VGTQ) and S2S (uX3Q): PASS
- CEO host ceo@aviatorpass.com intact: PASS — do not disconnect; not used to host reviewer live classes
- Classroom Meeting SDK JWT path only (no user OAuth scopes in product): PASS
- CEO/S2S provisioning of reviewer classroom: NOT SUPPORTED
- Isolated reviewer classroom create: BLOCKED (409 oauth_not_connected); /join/{classId}: MISSING
- Embedded host/participant join: NOT RUN
- Real two-way A/V: NOT CLAIMED as passed
- Customer meetings / CEO credentials / existing connections: unchanged

TROUBLESHOOTING
- 3712: Meeting SDK Client ID/Secret mismatch or Embed disabled
- 3000: host already in another meeting (Super Admin clear-live for ghosts; does not disconnect CEO)
- 409 oauth_not_connected / Please connect your Zoom account: Instructor OAuth not connected

OWNER MARKETPLACE ACTIONS STILL REQUIRED (not applied by code deploy)
1. Keep Create a Meeting user/admin/master REMOVED on Classroom app
2. Send Zoom Marketplace Support clarification on empty Scopes vs Meeting SDK JWT-only architecture (see docs/ZOOM_CLASSROOM_MARKETPLACE_SCOPE_RESOLUTION.md)
3. If Support requires one scope: add only user:read:zak (user-managed) — never meeting create/admin/master; do not recreate the app
4. Classroom app → disable Meetings surface; remove Custom Form; keep Embed → Meeting SDK on
5. Paste reviewer emails/passwords into private Account credentials only
6. Link https://www.aviatorpass.com/integrations/zoom-classroom-review in documentation fields after deploy
7. Complete reviewer instructor Connect Zoom + isolated /join/{classId} proof
8. Do NOT submit Marketplace updates until the account owner approves
9. Do NOT disconnect ceo@aviatorpass.com`;
