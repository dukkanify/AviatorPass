/**
 * Public reviewer content for the October 22 Zoom Marketplace final review.
 * No passwords or secrets.
 */

export const FINAL_REVIEW_PATH = "/integrations/zoom-marketplace-review";

export const FINAL_REVIEW_TITLE = "AviatorPass Zoom Marketplace — Final Review Test Plan";

export const FINAL_REVIEW_UPDATED = "22 October 2026";

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
    heading: "2. Production URLs",
    paragraphs: ["Use these addresses on production only."],
    bullets: [
      "Site: https://www.aviatorpass.com",
      "Meeting SDK landing: https://www.aviatorpass.com/join",
      "Instructor OAuth landing: https://www.aviatorpass.com/instructor/profile",
      "Meeting SDK documentation: https://www.aviatorpass.com/integrations/zoom",
      "This final review document: https://www.aviatorpass.com/integrations/zoom-marketplace-review",
      "Privacy: https://www.aviatorpass.com/legal/privacy",
      "Terms: https://www.aviatorpass.com/legal/terms",
      "OAuth callback (Instructor OAuth only): https://www.aviatorpass.com/api/integrations/zoom/callback",
    ],
  },
  {
    heading: "3. Reviewer accounts",
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
    heading: "4. Prerequisites",
    paragraphs: [
      "Both reviewer accounts must be active with complete profiles. The instructor must authorize a personal Zoom user that is not ceo@aviatorpass.com and not a customer Zoom account before a reviewer meeting can be created.",
      "AviatorPass Classroom for Zoom (Meeting SDK) does not create meetings. Meeting creation belongs to AviatorPass for Zoom (Instructor OAuth).",
    ],
  },
  {
    heading: "5. Meeting creation scopes audit",
    paragraphs: [
      "Zoom Marketplace often shows two Create a Meeting scopes: the user scope meeting:write:meeting and an admin or master variant such as meeting:write:meeting:admin.",
      "AviatorPass Instructor OAuth creates meetings with POST /users/me/meetings using the connected instructor’s user token. It does not manage Zoom sub-accounts and does not call account-level master create APIs for live classes.",
      "Keep meeting:write:meeting. Remove any admin or master Create a Meeting scope from AviatorPass for Zoom if that application is under review.",
      "AviatorPass Classroom for Zoom (Meeting SDK) must not list Create a Meeting scopes. That application signs a Meeting SDK JWT only and has no user OAuth scopes.",
    ],
  },
  {
    heading: "6. Scopes retained for AviatorPass for Zoom",
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
    heading: "7. Scopes removed or never used",
    paragraphs: ["Remove these from the Marketplace application under review if they appear."],
    bullets: [
      "meeting:write:meeting:admin or any master Create a Meeting scope — not used. Live classes do not create meetings for Zoom sub-accounts.",
      "meeting:read:list_meetings — not in the default AviatorPass authorize set.",
      "Any user-managed OAuth scope on AviatorPass Classroom for Zoom — Meeting SDK uses Client ID and Client Secret for JWT signing only.",
    ],
  },
  {
    heading: "8. Features Surface configuration",
    paragraphs: [
      "AviatorPass Classroom for Zoom opens inside the AviatorPass website, not inside the Zoom Meetings product UI.",
      "Manual change in Zoom Marketplace for that application: Features → Surface → remove Meetings if it is selected. Keep only surfaces that match a browser / embedded Meeting SDK listing. Do not claim an in-client Zoom Meetings surface that the product does not open.",
      "AviatorPass for Zoom is a General OAuth connect flow on the AviatorPass instructor profile. It also does not open as a Meetings in-product surface.",
    ],
  },
  {
    heading: "9. Custom Form",
    paragraphs: [
      "AviatorPass does not use the Zoom Custom Form feature. No registration or intake form is rendered through Zoom Custom Form.",
      "Manual change: Zoom Marketplace → the application under review → Features / Custom Form → remove or disable the Custom Form. Leave AviatorPass pages and APIs unchanged.",
    ],
  },
  {
    heading: "10. Authorization flow — Instructor OAuth",
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
    heading: "11. Authorization flow — Meeting SDK",
    paragraphs: [
      "AviatorPass Classroom for Zoom has no Zoom OAuth consent screen. After AviatorPass sign-in, the server signs a Meeting SDK JWT for the class the user may enter.",
    ],
  },
  {
    heading: "12. Instructor workflow",
    paragraphs: ["After personal Zoom is connected:"],
    bullets: [
      "Open https://www.aviatorpass.com/join or /instructor/classes.",
      "Create or open Marketplace reviewer classroom — ATPL meteorology with the reviewer student enrolled.",
      "Super Admin may call POST /api/admin/zoom/reviewer-classroom after personal Zoom is ready. That action creates only the isolated reviewer class and does not touch customer meetings.",
      "Open /join/{classId} and start the embedded meeting as host.",
    ],
  },
  {
    heading: "13. Student workflow",
    paragraphs: ["In a separate fresh browser session:"],
    bullets: [
      "Sign in as zoom.reviewer.student@aviatorpass.com.",
      "Open https://www.aviatorpass.com/join and choose the same class, or open /join/{classId} from Schedule.",
      "Expected: embedded Meeting SDK joins as a participant.",
      "Open /instructor/profile. Expected: /access-denied. Zoom Account is not shown.",
    ],
  },
  {
    heading: "14. Meeting SDK embedded joining",
    paragraphs: [
      "When the class has a numeric Zoom meeting, POST /api/zoom/in-app-session returns a Meeting SDK signature. Role 0 is the participant. Role 1 is the host when a host ZAK is available.",
      "Leave Class closes the embedded session in the browser. It does not delete the AviatorPass account.",
    ],
  },
  {
    heading: "15. Disconnect and deauthorization",
    paragraphs: [
      "Instructor OAuth: on /instructor/profile choose Disconnect Zoom. Expected: Not Connected. Creating a new live class then returns HTTP 409 until Connect Zoom succeeds again.",
      "Meeting SDK Marketplace remove: removing AviatorPass Classroom for Zoom from a Zoom account does not delete AviatorPass users or classes because that application stores no user OAuth token.",
    ],
  },
  {
    heading: "16. Expected results already verified",
    paragraphs: [
      "Verified on production before this document was published. Live embedded meeting completion remains blocked until personal Zoom authorization succeeds.",
    ],
    bullets: [
      "Reviewer instructor and student can sign in.",
      "Signed-out /join returns to /login?next=%2Fjoin and back to /join after login.",
      "Signed-out /instructor/profile returns to the profile after instructor login.",
      "Student cannot open instructor routes.",
      "Meeting SDK Client ID suffix VGTQ with its secret is accepted by Zoom (credentialPairValid true).",
      "POST /api/admin/zoom/reviewer-classroom returns oauth_not_connected and creates no class while the instructor is disconnected. Customer class count is unchanged.",
      "Connect Zoom reaches Zoom sign-in with signed state. Live client suffix on production was dhiQ, which is not Production Client ID 7z2krfWYQWCi20C0FRZ0xA.",
    ],
  },
  {
    heading: "17. Known limitations and blockers",
    paragraphs: [
      "Blocker: the reviewer instructor has not authorized a personal Zoom user, so no isolated reviewer meeting exists and embedded host or participant joins have not been completed.",
      "Blocker: the Production Client Secret for Instructor OAuth Client ID 7z2krfWYQWCi20C0FRZ0xA is not stored in Vercel. Every stored secret returns invalid_client for that Client ID. Meeting SDK and Server-to-Server credentials must not be reused.",
      "Do not mark host start, student join, or meeting ownership as successful until both roles complete those steps on production.",
    ],
  },
  {
    heading: "18. Troubleshooting",
    paragraphs: ["Common outcomes and meaning."],
    bullets: [
      "HTTP 409 Please connect your Zoom account — Instructor OAuth not connected.",
      "Zoom invalid_client on the Production Client ID — matching Production Client Secret is missing from ZOOM_INSTRUCTOR_CLIENT_SECRET.",
      "Zoom error 3712 — Meeting SDK Client ID and Secret are not a matching pair, or Embed is disabled.",
      "Zoom error 3000 — the host Zoom user is already in another meeting.",
      "Access denied — a student opened an instructor route.",
      "No class is ready — no assigned reviewer class exists yet.",
    ],
  },
  {
    heading: "19. Manual Marketplace checklist",
    paragraphs: [
      "Complete these in Zoom Marketplace before resubmission. Do not submit until the account owner approves.",
    ],
    bullets: [
      "AviatorPass for Zoom: keep user scopes listed in section 6. Remove admin or master Create a Meeting.",
      "AviatorPass for Zoom: Production Client ID 7z2krfWYQWCi20C0FRZ0xA with its matching Production Client Secret in Vercel ZOOM_INSTRUCTOR_* only.",
      "AviatorPass for Zoom: OAuth Redirect and Allow List = https://www.aviatorpass.com/api/integrations/zoom/callback.",
      "AviatorPass Classroom for Zoom: name AviatorPass Classroom for Zoom. Landing https://www.aviatorpass.com/join. Docs https://www.aviatorpass.com/integrations/zoom. No OAuth scopes. No Custom Form. Remove Meetings surface if selected.",
      "Both apps: paste reviewer emails into private Account credentials with passwords from the owner’s private handoff only.",
    ],
  },
];
