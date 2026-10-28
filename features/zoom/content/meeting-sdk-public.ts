/**
 * Public copy for AviatorPass Classroom for Zoom.
 * This is the Meeting SDK application, not the instructor OAuth application.
 */

export const MEETING_SDK_APP_NAME = "AviatorPass Classroom for Zoom";

export const MEETING_SDK_DIRECT_LANDING_PATH = "/join";

export const MEETING_SDK_DOCS_PATH = "/integrations/zoom";

export const MEETING_SDK_SHORT_DESCRIPTION =
  "Enter a scheduled AviatorPass class in the browser. Instructors host and students attend inside AviatorPass.";

export const MEETING_SDK_INDEPENDENCE =
  "AviatorPass is an independent aviation training platform. Zoom Video Communications does not own, operate, or endorse AviatorPass.";

export const MEETING_SDK_LISTING_PARAGRAPHS = [
  "AviatorPass Classroom for Zoom opens a scheduled AviatorPass class in the browser. The meeting runs inside AviatorPass through the Zoom Meeting SDK.",
  "AviatorPass is an independent aviation training platform. Zoom Video Communications does not own, operate, or endorse AviatorPass.",
  "Students join as participants. An instructor can start a class as host when that class already has a meeting on the instructor’s own Zoom account. Creating that meeting uses a different AviatorPass integration and is not part of this application.",
  "This application does not ask the user to authorize Zoom scopes. AviatorPass signs a Meeting SDK token on the server for the class that person is allowed to enter.",
] as const;

export type MeetingSdkDocSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export const MEETING_SDK_DOC_SECTIONS: MeetingSdkDocSection[] = [
  {
    heading: "Prerequisites",
    paragraphs: [
      "You need an active AviatorPass account with a completed profile. Instructors and students use the same classroom address.",
      "A class must already exist, and you must be the assigned instructor or an enrolled student. The classroom does not accept anonymous visitors.",
    ],
    bullets: [
      "Instructor reviewer: zoom.reviewer.instructor@aviatorpass.com",
      "Student reviewer: zoom.reviewer.student@aviatorpass.com",
      "Passwords are delivered only in Zoom’s private account-credentials field.",
      "Support: support@aviatorpass.com",
    ],
  },
  {
    heading: "Adding the app",
    paragraphs: [
      "AviatorPass Classroom for Zoom is used from AviatorPass. Students and instructors do not connect a Zoom account on this page, and AviatorPass does not send them through a Zoom OAuth consent screen for this application.",
      "Open the classroom address below. If you are signed out, AviatorPass asks you to sign in and then returns you to the classroom list.",
    ],
    bullets: [
      "Classroom address: https://www.aviatorpass.com/join",
      "Sign in with your AviatorPass email and password.",
      "Choose the class you are assigned to teach or attend.",
      "A Marketplace reviewer who uses Zoom’s Add button is authorizing the listing only. The class still opens from the classroom address after AviatorPass sign-in.",
    ],
  },
  {
    heading: "Using the app",
    paragraphs: [
      "The classroom list shows the classes your account may enter. Open a class to load the in-app classroom. When that class has a numeric Zoom meeting, AviatorPass initializes the embedded Meeting SDK.",
      "Students enter as participants. The instructor enters as host only when AviatorPass can obtain a host token for that meeting. Leaving the browser page does not delete the AviatorPass account.",
    ],
    bullets: [
      "Instructor path: sign in, open the classroom list, open the class, and start it from the embedded meeting.",
      "Student path: sign in on a separate browser session, open the same classroom list, and join the class.",
      "The student session cannot open instructor settings.",
    ],
  },
  {
    heading: "Detailed Meeting SDK test (host and participant)",
    paragraphs: [
      "Use two browsers. Complete instructor Connect Zoom on the separate AviatorPass for Zoom integration before creating a class. This Classroom application does not create meetings.",
      "Automated Cloud Agent environments cannot claim real two-way human audio and video. Reviewers should confirm microphone and camera on physical devices when available.",
    ],
    bullets: [
      "Instructor login: https://www.aviatorpass.com/login as zoom.reviewer.instructor@aviatorpass.com → /instructor/profile → Connect Zoom with a dedicated personal Zoom user (not ceo@aviatorpass.com).",
      "Create an isolated class (or Super Admin POST /api/admin/zoom/reviewer-classroom after personalZoomReady is true) and enroll zoom.reviewer.student@aviatorpass.com.",
      "Host start: open https://www.aviatorpass.com/join/{classId}. Expect embedded Meeting SDK with HOST controls when join succeeds.",
      "Student join: separate session as zoom.reviewer.student@aviatorpass.com → same /join/{classId}. Expect participant join without host start URL.",
      "Controls: Mute, Stop Video, Participants, Chat, Leave Class as provided by the embedded SDK.",
      "End meeting: Leave Class on host and student. AviatorPass accounts remain.",
      "If personalZoomReady is false, classroom create returns HTTP 409 oauth_not_connected — that is expected until Connect Zoom completes.",
    ],
  },
  {
    heading: "Removing the app",
    paragraphs: [
      "Inside a class, choose Leave Class. That closes the embedded meeting in this browser. It does not delete your AviatorPass account, enrolment, or class record.",
      "To remove the Marketplace installation from a Zoom account, open Zoom App Marketplace, find AviatorPass Classroom for Zoom, and remove it. AviatorPass does not store a user OAuth token for this application, so removal does not revoke a classroom token on AviatorPass.",
    ],
  },
  {
    heading: "Authorization",
    paragraphs: [
      "This Meeting SDK application does not use a separate user OAuth flow and does not request user-managed scopes. The server signs a Meeting SDK JSON Web Token with the Meeting SDK Client ID and Client Secret. The token names the meeting number and whether the person is a participant or a host.",
      "If the Marketplace configuration for this application lists OAuth scopes, that listing does not match the product. Those scopes should be removed from this application. They belong, when used, to the separate instructor integration named AviatorPass for Zoom.",
    ],
  },
  {
    heading: "Disconnect, deauthorization, and user impact",
    paragraphs: [
      "Deauthorizing or removing AviatorPass Classroom for Zoom from a Zoom account does not delete AviatorPass users, classes, or attendance. The next visit still requires an AviatorPass sign-in.",
      "Disconnect Zoom on the instructor profile belongs to AviatorPass for Zoom, the instructor OAuth application. It is not the removal step for this Meeting SDK application. Disconnecting there prevents that instructor from creating new meetings on their personal Zoom account. Existing AviatorPass accounts remain.",
    ],
  },
  {
    heading: "Troubleshooting",
    paragraphs: [
      "Sign-in returns you to the classroom list only when you opened https://www.aviatorpass.com/join while signed out. A student who opens an instructor page is shown Access denied.",
    ],
    bullets: [
      "Unable to join: the class is missing, cancelled, or your account is not assigned to it.",
      "Please connect your Zoom account before creating a live class: the instructor has not connected a personal Zoom account on the separate instructor OAuth application. This Meeting SDK page cannot create that meeting.",
      "Zoom error 3712: the Meeting SDK Client ID and Client Secret on the server are not a matching pair, or Embed is not enabled on that Zoom application.",
      "Zoom error 3000: the host Zoom account is already in another meeting.",
      "The page stays in classroom mode without the embedded meeting: the class has no numeric Zoom meeting number yet.",
    ],
  },
];
