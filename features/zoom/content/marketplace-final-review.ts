/**
 * Public reviewer content for the October 22 Zoom Marketplace final review.
 * No passwords or secrets.
 */

export const FINAL_REVIEW_PATH = "/integrations/zoom-marketplace-review";

export const FINAL_REVIEW_TITLE = "AviatorPass Zoom Marketplace — Final Review Test Plan";

export const FINAL_REVIEW_UPDATED =
  "28 October 2026 (Classroom functional review package linked; CEO vs reviewer clarified)";

export type ReviewSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export const FINAL_REVIEW_SECTIONS: ReviewSection[] = [
  {
    heading: "1. Application identification",
    paragraphs: [
      "AviatorPass uses two separate Zoom applications. Do not mix their credentials, scopes, or Landing URLs.",
    ],
    bullets: [
      "AviatorPass Classroom for Zoom — Meeting SDK. Embeds the class inside AviatorPass. Credentials: ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET. Direct Landing URL: https://www.aviatorpass.com/join. Public docs: https://www.aviatorpass.com/integrations/zoom.",
      "AviatorPass for Zoom — Instructor OAuth General app. Connect Zoom and create meetings on the instructor’s personal Zoom user. Credentials: ZOOM_INSTRUCTOR_CLIENT_ID and ZOOM_INSTRUCTOR_CLIENT_SECRET. Direct Landing URL: https://www.aviatorpass.com/instructor/profile. Production Client ID to use: 7z2krfWYQWCi20C0FRZ0xA.",
      "Server-to-Server OAuth is a third credential set for platform booking only. It is not the Marketplace user-facing application under this review.",
      "AviatorPass is independent. Zoom Video Communications does not own, operate, or endorse AviatorPass.",
    ],
  },
  {
    heading: "2. EU Marketplace business identity",
    paragraphs: [
      "Use these values on the Zoom Marketplace EU company / business-identity form. They match the public legal pages on production.",
    ],
    bullets: [
      "Platform name: AviatorPass",
      "Operating business (legal entity): EAGER PILOTS FOR AVIATION CONSULTATION AND TRAINING",
      "Website: https://www.aviatorpass.com",
      "Privacy policy: https://www.aviatorpass.com/legal/privacy",
      "Terms of Service: https://www.aviatorpass.com/legal/terms",
      "Support: support@aviatorpass.com",
      "Controller / contact: info@aviatorpass.com",
      "Registered address, commercial registration, and VAT numbers are supplied by the account owner from the submitted legal pack — they are not invented in this repository.",
    ],
  },
  {
    heading: "3. Production URLs",
    paragraphs: ["Use these addresses on production only."],
    bullets: [
      "Site: https://www.aviatorpass.com",
      "Meeting SDK landing: https://www.aviatorpass.com/join",
      "Instructor OAuth landing: https://www.aviatorpass.com/instructor/profile",
      "Meeting SDK documentation: https://www.aviatorpass.com/integrations/zoom",
      "This final review document: https://www.aviatorpass.com/integrations/zoom-marketplace-review",
      "Classroom Meeting SDK functional review: https://www.aviatorpass.com/integrations/zoom-classroom-review",
      "Privacy: https://www.aviatorpass.com/legal/privacy",
      "Terms: https://www.aviatorpass.com/legal/terms",
      "OAuth callback (Instructor OAuth only): https://www.aviatorpass.com/api/integrations/zoom/callback",
    ],
  },
  {
    heading: "4. Reviewer accounts",
    paragraphs: [
      "Use a fresh browser session for each role. Passwords are not published on this page. The platform owner pastes them only into Zoom’s private Account credentials field.",
    ],
    bullets: [
      "Instructor — Riley Okonkwo — zoom.reviewer.instructor@aviatorpass.com",
      "Student — Jordan Hale — zoom.reviewer.student@aviatorpass.com",
      "Owner password retrieval: open Super Admin → Users, select the reviewer, set a new temporary password, then paste it into Zoom’s private field. Do not put passwords in Git, this page, or the public Marketplace listing.",
    ],
  },
  {
    heading: "5. Account model — platform CEO vs reviewer personal Zoom",
    paragraphs: [
      "Do not treat the reviewer instructor’s personalZoomReady flag as the health check for the whole Zoom stack. Production uses three separate credential paths.",
    ],
    bullets: [
      "Platform / CEO Zoom (Server-to-Server): account email ceo@aviatorpass.com. This is the shared platform host identity. It is not an instructor Connect Zoom row. Live production checks keep host ZAK readiness on this account. Do not disconnect it for Marketplace review.",
      "AviatorPass for Zoom (Instructor OAuth): each instructor must Connect Zoom with their own personal Zoom user. Live class meeting creation in production requires personalZoomReady and never falls back to ceo@aviatorpass.com.",
      "AviatorPass Classroom for Zoom (Meeting SDK): embeds the meeting inside /join. It does not create meetings and does not store instructor OAuth tokens.",
      "Marketplace publish status is separate from website deployment and from whether the app owner can open Zoom’s authorize URL. An unpublished General app can still authorize allow-listed or owner Zoom users; external Marketplace reviewers follow Zoom’s publish/submit process.",
      "Reviewer testing must use a dedicated personal Zoom login on zoom.reviewer.instructor@aviatorpass.com — never ceo@aviatorpass.com and never a customer Zoom account.",
    ],
  },
  {
    heading: "6. Prerequisites",
    paragraphs: [
      "Both reviewer accounts must be active with complete profiles. The instructor must authorize a personal Zoom user that is not ceo@aviatorpass.com and not a customer Zoom account before a reviewer meeting can be created.",
      "AviatorPass Classroom for Zoom (Meeting SDK) does not create meetings. Meeting creation belongs to AviatorPass for Zoom (Instructor OAuth).",
    ],
  },
  {
    heading: "7. Meeting creation scopes audit",
    paragraphs: [
      "Zoom Marketplace often shows two Create a Meeting scopes: the user scope meeting:write:meeting and an admin or master variant such as meeting:write:meeting:admin.",
      "AviatorPass Instructor OAuth creates meetings with POST /users/me/meetings using the connected instructor’s user token. It does not manage Zoom sub-accounts and does not call account-level master create APIs for live classes.",
      "Keep meeting:write:meeting. Remove any admin or master Create a Meeting scope from AviatorPass for Zoom if that application is under review.",
      "AviatorPass Classroom for Zoom (Meeting SDK) must not list Create a Meeting scopes. That application signs a Meeting SDK JWT only and has no user OAuth scopes.",
    ],
  },
  {
    heading: "8. Scopes retained for AviatorPass for Zoom",
    paragraphs: [
      "These are the only user-managed scopes implemented for Instructor OAuth. Do not enable admin or master duplicates.",
    ],
    bullets: [
      "user:read:user — Purpose: load the Zoom identity after Connect Zoom. Feature: Instructor profile Zoom Account. API: GET /users/me. Page: /instructor/profile. Reviewer: instructor. Test: Connect Zoom, approve, confirm the connected email is the personal Zoom user.",
      "meeting:write:meeting — Purpose: create the class meeting on that Zoom user. Feature: Live class create. API: POST /users/me/meetings. Page: /instructor/classes after personal Zoom is connected. Reviewer: instructor. Test: create Marketplace reviewer classroom — ATPL meteorology and confirm a Zoom meeting exists for that instructor.",
      "meeting:read:meeting — Purpose: read meeting details during sync and host refresh. Feature: Sync / join preparation. API: GET /meetings/{meetingId}. Page: /instructor/profile Sync now and /join/{classId}. Reviewer: instructor.",
      "meeting:update:meeting — Purpose: update schedule or topic when the class changes. Feature: Reschedule or edit live class. API: PATCH /meetings/{meetingId}. Page: /instructor/classes. Reviewer: instructor.",
      "meeting:delete:meeting — Purpose: delete the Zoom meeting when the class is cancelled. Feature: Cancel live class. API: DELETE /meetings/{meetingId}. Page: /instructor/classes. Reviewer: instructor.",
    ],
  },
  {
    heading: "9. Scopes removed or never used",
    paragraphs: ["Remove these from the Marketplace application under review if they appear."],
    bullets: [
      "meeting:write:meeting:admin or any master Create a Meeting scope — not used. Live classes do not create meetings for Zoom sub-accounts.",
      "meeting:read:list_meetings — not in the default AviatorPass authorize set.",
      "Any user-managed OAuth scope on AviatorPass Classroom for Zoom — Meeting SDK uses Client ID and Client Secret for JWT signing only.",
    ],
  },
  {
    heading: "10. Features Surface configuration",
    paragraphs: [
      "AviatorPass Classroom for Zoom opens inside the AviatorPass website, not inside the Zoom Meetings product UI.",
      "Manual change in Zoom Marketplace for that application: Features → Surface → remove Meetings if it is selected. Keep only surfaces that match a browser / embedded Meeting SDK listing. Do not claim an in-client Zoom Meetings surface that the product does not open.",
      "AviatorPass for Zoom is a General OAuth connect flow on the AviatorPass instructor profile. It also does not open as a Meetings in-product surface.",
    ],
  },
  {
    heading: "11. Custom Form",
    paragraphs: [
      "AviatorPass does not use the Zoom Custom Form feature. No registration or intake form is rendered through Zoom Custom Form.",
      "Manual change: Zoom Marketplace → the application under review → Features / Custom Form → remove or disable the Custom Form. Leave AviatorPass pages and APIs unchanged.",
    ],
  },
  {
    heading: "12. Authorization flow — Instructor OAuth",
    paragraphs: ["Only AviatorPass for Zoom uses user OAuth."],
    bullets: [
      "Open https://www.aviatorpass.com/instructor/profile while signed out. Expected: /login?next=%2Finstructor%2Fprofile.",
      "Sign in as the instructor reviewer. Expected: return to /instructor/profile with Zoom Account Not Connected.",
      "Choose Connect Zoom. Expected: https://zoom.us/oauth/authorize with response_type=code, redirect_uri=https://www.aviatorpass.com/api/integrations/zoom/callback, signed state, and no scope query parameter by default.",
      "Sign in with a dedicated personal Zoom user. Approve. Expected: return to /instructor/profile Connected with that Zoom email and personalZoomReady true.",
      "Do not authorize ceo@aviatorpass.com or a customer Zoom account.",
    ],
  },
  {
    heading: "13. Authorization flow — Meeting SDK",
    paragraphs: [
      "AviatorPass Classroom for Zoom has no Zoom OAuth consent screen. After AviatorPass sign-in, the server signs a Meeting SDK JWT for the class the user may enter.",
    ],
  },
  {
    heading: "14. Instructor workflow",
    paragraphs: ["After personal Zoom is connected:"],
    bullets: [
      "Open https://www.aviatorpass.com/join or /instructor/classes.",
      "Create or open Marketplace reviewer classroom — ATPL meteorology with the reviewer student enrolled.",
      "Super Admin may call POST /api/admin/zoom/reviewer-classroom after personal Zoom is ready. That action creates only the isolated reviewer class and does not touch customer meetings.",
      "Open /join/{classId} and start the embedded meeting as host.",
    ],
  },
  {
    heading: "15. Student workflow",
    paragraphs: ["In a separate fresh browser session:"],
    bullets: [
      "Sign in as zoom.reviewer.student@aviatorpass.com.",
      "Open https://www.aviatorpass.com/join and choose the same class, or open /join/{classId} from Schedule.",
      "Expected: embedded Meeting SDK joins as a participant.",
      "Open /instructor/profile. Expected: /access-denied. Zoom Account is not shown.",
    ],
  },
  {
    heading: "16. Meeting SDK embedded joining",
    paragraphs: [
      "When the class has a numeric Zoom meeting, POST /api/zoom/in-app-session returns a Meeting SDK signature. Role 0 is the participant. Role 1 is the host when a host ZAK is available.",
      "Leave Class closes the embedded session in the browser. It does not delete the AviatorPass account.",
    ],
  },
  {
    heading: "17. Disconnect and deauthorization",
    paragraphs: [
      "Instructor OAuth: on /instructor/profile choose Disconnect Zoom. Expected: Not Connected. Creating a new live class then returns HTTP 409 until Connect Zoom succeeds again.",
      "Meeting SDK Marketplace remove: removing AviatorPass Classroom for Zoom from a Zoom account does not delete AviatorPass users or classes because that application stores no user OAuth token.",
    ],
  },
  {
    heading: "18. Expected results already verified",
    paragraphs: [
      "Live production re-check on 23 October 2026 11:47 Asia/Dubai (deployment gitSha aefb668149cbb1c47ed235631924a7017212e73d). Platform CEO Zoom (S2S) remains healthy. Reviewer personal Zoom is still not connected — that is expected until a dedicated test Zoom user authorizes Connect Zoom.",
    ],
    bullets: [
      "Reviewer instructor and student can sign in.",
      "Signed-out /join returns to /login?next=%2Fjoin and back to /join after login.",
      "Signed-out /instructor/profile returns to the profile after instructor login.",
      "Student cannot open instructor routes (/instructor/profile → /access-denied).",
      "Meeting SDK Client ID suffix VGTQ with its secret is accepted by Zoom (credentialPairValid true).",
      "Platform Zoom accountEmail / hostZak hostUser is ceo@aviatorpass.com with hostZak.ready true (Server-to-Server). No AviatorPass instructor OAuth row owns that CEO connection.",
      "Live class create for an instructor without personal Zoom returns HTTP 409 and does not create a meeting on the CEO account.",
      "Connect Zoom authorize URL uses Production Client ID 7z2krfWYQWCi20C0FRZ0xA (suffix Z0xA, length 22), redirect_uri https://www.aviatorpass.com/api/integrations/zoom/callback, signed state, and no scope query parameter.",
      "ZOOM_INSTRUCTOR_CLIENT_ID matches the Production Client ID. ZOOM_INSTRUCTOR_CLIENT_SECRET pairs with that Client ID (Zoom returns invalid_grant on a dummy code — not invalid_client). Meeting SDK and Server-to-Server secrets are separate.",
      "Admin GET /api/admin/instructors/zoom: Riley Okonkwo (zoom.reviewer.instructor@aviatorpass.com) remains connected false, personalZoomReady false, zoomEmail null — same as the other listed instructors.",
      "Live snapshot 22 October 2026 19:50 Asia/Dubai: instructor profile Zoom Account badge shows Not Connected; GET /api/integrations/zoom/status returns connected false, personalZoomReady false, zoomEmail null, sharedPlatformAccount false; POST /api/integrations/zoom/sync reports Zoom is not connected.",
      "POST /api/admin/zoom/reviewer-classroom returns HTTP 409 block oauth_not_connected and creates no class. No customer meetings or classes were created or modified.",
      "Classroom URL: none — no isolated reviewer classId exists yet.",
      "Instructor host Meeting SDK session: not run (no classId).",
      "Student participant join / Meeting SDK load: not run (no classId).",
      "Audio and video checks: not run (no classId).",
      "Role permissions already verified without a meeting: student cannot open /instructor/profile; unrelated demo student is not used for the reviewer classroom.",
      "Production runtime (last 24h): OAuth callback processing failed once at 15:20 Asia/Dubai and empty/rejected callbacks at 16:10 Asia/Dubai — no successful Instructor OAuth connect was recorded for the reviewer instructor.",
    ],
  },
  {
    heading: "19. Known limitations and blockers",
    paragraphs: [
      "Reviewer personal Zoom is still not connected (personalZoomReady false). That blocks only the isolated Marketplace reviewer classroom and embedded host/student proof — it does not mean the CEO/platform S2S integration is down.",
      "AviatorPass for Zoom is unpublished on Marketplace. Unpublished status is separate from website deployment and from owner Connect Zoom authorize. External Marketplace reviewers follow Zoom’s publish/submit rules; owner/allow-listed Zoom users can still authorize for Local Test.",
      "If Zoom Marketplace shows an app as installed, that alone does not set AviatorPass Connected. The reviewer instructor must complete Connect Zoom from /instructor/profile with a dedicated personal Zoom user (never ceo@aviatorpass.com).",
      "Owner action: authorize the dedicated test Zoom user on zoom.reviewer.instructor@aviatorpass.com, confirm personalZoomReady true, then POST /api/admin/zoom/reviewer-classroom and re-test host/student on /join/{classId}. Do not disconnect the CEO platform Zoom account. Do not submit either Marketplace application without owner approval.",
    ],
  },
  {
    heading: "20. Troubleshooting",
    paragraphs: ["Common outcomes and meaning."],
    bullets: [
      "HTTP 409 Please connect your Zoom account — Instructor OAuth not connected.",
      "HTTP 409 oauth_not_connected on POST /api/admin/zoom/reviewer-classroom — reviewer instructor personalZoomReady is false.",
      "Zoom invalid_client on the Production Client ID — matching Production Client Secret is missing from ZOOM_INSTRUCTOR_CLIENT_SECRET.",
      "OAuth callback processing failed — token exchange or profile fetch failed after Zoom redirected back; retry Connect Zoom in one uninterrupted browser session.",
      "OAuth callback rejected — empty callback (missing code/state) or cancelled authorize; no AviatorPass connection is written.",
      "already_linked — that Zoom user id is already stored on another AviatorPass instructor; use a dedicated personal Zoom login for the reviewer.",
      "Zoom error 3712 — Meeting SDK Client ID and Secret are not a matching pair, or Embed is disabled.",
      "Zoom error 3000 — the host Zoom user is already in another meeting.",
      "Access denied — a student opened an instructor route.",
      "No class is ready — no assigned reviewer class exists yet.",
    ],
  },
  {
    heading: "21. Manual Marketplace checklist",
    paragraphs: [
      "Complete these in Zoom Marketplace before resubmission. Do not submit until the account owner approves. Neither application is ready for submission while personalZoomReady remains false and the host/student embedded meeting test is incomplete.",
    ],
    bullets: [
      "AviatorPass for Zoom: keep user scopes listed in section 7. Remove admin or master Create a Meeting.",
      "AviatorPass for Zoom: Production Client ID 7z2krfWYQWCi20C0FRZ0xA with its matching Production Client Secret in Vercel ZOOM_INSTRUCTOR_* only.",
      "AviatorPass for Zoom: OAuth Redirect and Allow List = https://www.aviatorpass.com/api/integrations/zoom/callback.",
      "AviatorPass Classroom for Zoom: name AviatorPass Classroom for Zoom. Landing https://www.aviatorpass.com/join. Docs https://www.aviatorpass.com/integrations/zoom. No OAuth scopes. No Custom Form. Remove Meetings surface if selected.",
      "Both apps: paste reviewer emails into private Account credentials with passwords from the owner’s private handoff only.",
      "Submission readiness (22 October 2026 19:50 Asia/Dubai): not ready — AviatorPass for Zoom still needs a successful personal Connect Zoom on the reviewer instructor; AviatorPass Classroom for Zoom still needs a completed embedded host and participant join on the isolated reviewer classroom.",
    ],
  },
];
