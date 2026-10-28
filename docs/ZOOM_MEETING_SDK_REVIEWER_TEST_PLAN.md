# AviatorPass Classroom for Zoom — reviewer test plan

This plan is for the **Meeting SDK** application. It is not the test plan for **AviatorPass for Zoom**, the separate instructor OAuth application. Do not submit either Marketplace application from this document.

Production site: https://www.aviatorpass.com

Public documentation: https://www.aviatorpass.com/integrations/zoom

Direct Landing URL: https://www.aviatorpass.com/join

## Application identity

| Field                        | Value                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Proposed Marketplace name    | AviatorPass Classroom for Zoom                                                                                                  |
| Product                      | AviatorPass                                                                                                                     |
| Integration                  | Embedded Zoom Meeting SDK inside an AviatorPass class                                                                           |
| Credentials                  | `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` only                                                                                  |
| Not used by this application | `ZOOM_INSTRUCTOR_CLIENT_ID`, `ZOOM_INSTRUCTOR_CLIENT_SECRET`, `ZOOM_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET` |

AviatorPass is an independent aviation training platform. Zoom Video Communications does not own, operate, or endorse AviatorPass.

## Prerequisites

1. Use a fresh browser session for each role.
2. Use the dedicated reviewer accounts. Do not use customer accounts.

| Role       | Name          | Email                                      |
| ---------- | ------------- | ------------------------------------------ |
| Instructor | Riley Okonkwo | `zoom.reviewer.instructor@aviatorpass.com` |
| Student    | Jordan Hale   | `zoom.reviewer.student@aviatorpass.com`    |

Passwords are not in this repository. Paste them only into Zoom’s private Account credentials field.

Both accounts are active and profile-complete. The instructor account is not connected to a personal Zoom user. Because of that, production cannot yet create a Zoom meeting for this instructor.

## Authorization

AviatorPass Classroom for Zoom does **not** ask the reviewer to authorize a Zoom user, and it does **not** request user-managed OAuth scopes.

The server signs a Meeting SDK JWT with the Meeting SDK Client ID as `appKey` and the matching Client Secret. The token includes the meeting number and role (`0` participant, `1` host). Students receive the participant signature. The instructor receives the host signature only when a host ZAK is available for that meeting.

If the Marketplace screen for this Meeting SDK application lists OAuth scopes, remove them from this application. Those scopes are not called by the embedded classroom. The scopes below belong only to the other application, AviatorPass for Zoom:

| Scope                    | Where it is used                            | Used by this Meeting SDK application |
| ------------------------ | ------------------------------------------- | ------------------------------------ |
| `user:read:user`         | Instructor OAuth profile after Connect Zoom | No                                   |
| `meeting:write:meeting`  | Instructor OAuth creates the meeting        | No                                   |
| `meeting:read:meeting`   | Instructor OAuth reads the meeting          | No                                   |
| `meeting:update:meeting` | Instructor OAuth updates the meeting        | No                                   |
| `meeting:delete:meeting` | Instructor OAuth deletes the meeting        | No                                   |

No authorization step is required on `https://zoom.us/oauth/authorize` for this application. Opening Connect Zoom is the other application and is not the Meeting SDK test.

## Separation from instructor OAuth

|                                                   | AviatorPass Classroom for Zoom                                                | AviatorPass for Zoom                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Purpose                                           | Embed a meeting in the class                                                  | Connect the instructor’s personal Zoom account and create the meeting |
| Direct Landing URL                                | https://www.aviatorpass.com/join                                              | https://www.aviatorpass.com/instructor/profile                        |
| User OAuth                                        | None                                                                          | Yes, with signed `state`                                              |
| Production client suffix verified 19 October 2026 | `VGTQ` (length 22)                                                            | Live value ends `dhiQ`; expected Production ID ends `Z0xA`            |
| Secret                                            | Matching Meeting SDK secret is accepted by Zoom (`credentialPairValid: true`) | Production secret for `7z2krfWYQWCi20C0FRZ0xA` is not stored          |

Do not copy credentials between these applications.

## Instructor workflow

1. Open https://www.aviatorpass.com/join in a fresh session.
2. Expected: `/login?next=%2Fjoin`.
3. Sign in as the instructor reviewer.
4. Expected: the browser returns to `/join`, titled AviatorPass Classroom for Zoom. It lists assigned classes or shows **No class is ready**.
5. If a class is listed, choose **Open classroom**.
6. Expected when a numeric Zoom meeting exists: `/join/{classId}` loads the embedded Meeting SDK and the instructor can start it as host.
7. Expected when no class exists: the lobby explains that a meeting cannot be embedded yet. Do not treat that empty state as a successful meeting.

## Student workflow

1. Open https://www.aviatorpass.com/login in a different fresh session.
2. Sign in as the student reviewer.
3. Expected: `/student/dashboard`.
4. Open https://www.aviatorpass.com/join.
5. Expected: the same classroom list, limited to classes where this student is enrolled.
6. Open the class the instructor started.
7. Expected when a numeric Zoom meeting exists: the embedded Meeting SDK joins as a participant.
8. Open https://www.aviatorpass.com/instructor/profile.
9. Expected: `/access-denied`. The Zoom Account card is not shown.

## Evidence already on production before the classroom lobby

Checked on 19 October 2026 against deployment `dpl_ZqnnvUECMjy4RvNtZMgqJjRRaoLy`. This did not include a live embedded meeting.

- Reviewer instructor and student accounts can sign in.
- The student is sent to `/access-denied` from `/instructor/profile`.
- Meeting SDK Client ID suffix `VGTQ`, length 22, and its secret are a pair Zoom accepts (`credentialPairValid: true` on `GET /api/zoom/status`).
- Instructor OAuth and Server-to-Server credentials were not modified.
- The reviewer instructor cannot create a class until a personal Zoom account is connected on the other application.

The signed-out return to `/join` is verified on deployment `dpl_8pHrKRy123uaD4BVdvdAEmjyvLEC` (SHA `9062920f6614083f53f47cdac419759bf6d8ee30`).

## Production evidence for this deployment

Checked on 19 October 2026 after the classroom lobby and documentation page were deployed.

- `https://www.aviatorpass.com/integrations/zoom` returns HTTP 200 without sign-in and includes Adding the app, Using the app, and Removing the app.
- A signed-out visit to `https://www.aviatorpass.com/join` opens `/login?next=%2Fjoin`.
- The instructor reviewer returns to `/join` and sees **No class is ready**.
- The student reviewer returns to `/join` and sees **No class is ready**.
- The student reviewer is sent to `/access-denied` from `/instructor/profile`.
- `GET /api/zoom/status` still reports Meeting SDK suffix `VGTQ`, length 22, `credentialPairValid: true`. That client is not the instructor OAuth client and not the Server-to-Server client.
- The reviewer instructor’s class list is empty. Creating a class still depends on the separate instructor OAuth connection.
- The platform has other classes whose join URLs are on `us02web.zoom.us` and contain a numeric meeting id. Those classes were not opened. They are not assigned to the reviewer accounts, and joining one would enter another person’s meeting.
- The embedded Meeting SDK was not initialized against a live meeting in this test.

## Isolated reviewer classroom

This workflow does not open, edit, or end any existing customer meeting. It does not create a class until the reviewer instructor has authorized a personal Zoom user on AviatorPass for Zoom.

Super Admin only:

`POST /api/admin/zoom/reviewer-classroom`

The action looks up only these accounts:

- Instructor: `zoom.reviewer.instructor@aviatorpass.com`
- Student: `zoom.reviewer.student@aviatorpass.com`

**Centralized Classroom (current):** when platform Server-to-Server Zoom is configured, the action creates the isolated class on the platform host. `personalZoomReady` is **not** required.

**Personal OAuth fallback only:** if S2S is absent, the instructor must be `personalZoomReady` with a Zoom email that is not the platform host and not another AviatorPass account.

| Field     | Value                                             |
| --------- | ------------------------------------------------- |
| Title     | Marketplace reviewer classroom — ATPL meteorology |
| Duration  | 30 minutes                                        |
| Timezone  | Asia/Kuwait                                       |
| Enrolment | The reviewer student only                         |
| Join path | `/join/{classId}` returned by the action          |

Calling it again returns that same class. It does not create a second one and it does not scan other instructors’ meetings.

HTTP 409 `oauth_not_connected` occurs only when platform S2S is missing **and** the instructor is not personally connected.

### Actual class on 19 October 2026

No reviewer class exists. Production `POST /api/admin/zoom/reviewer-classroom` on deployment `dpl_6Uim8ZwadZvRWGJ7d3UT4rU7qitc` returned HTTP 409, block `oauth_not_connected`, and `classId: null`.

| Check                                        | Result                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer instructor Zoom                     | Disconnected, `personalZoomReady: false`, no Zoom email                                                                                                                |
| Dedicated Zoom test user in this environment | None. No Zoom email or password is stored, so Zoom’s sign-in page cannot be completed                                                                                  |
| Connect Zoom request                         | Opens `https://zoom.us/signin` with signed state and the production callback. Client suffix `dhiQ`, length 21. It is not Production Client ID `7z2krfWYQWCi20C0FRZ0xA` |
| Classes before and after the refused action  | 57 and 57. None added or removed                                                                                                                                       |
| Instructor host test                         | Not run. There is no class                                                                                                                                             |
| Student embedded Meeting SDK join            | Not run. There is no meeting                                                                                                                                           |
| Host and participant roles                   | Not verified                                                                                                                                                           |

The Production Client Secret for `7z2krfWYQWCi20C0FRZ0xA` is still not stored. Authorization of a dedicated Zoom user is blocked until the account owner supplies that secret, or confirms that the current instructor client may be used, and then signs that Zoom user in.

### Reviewer steps (Classroom VGTQ — centralized)

1. Super Admin calls `POST /api/admin/zoom/reviewer-classroom` (platform S2S required; personal Connect Zoom optional).
2. Sign in as the reviewer instructor and open the returned `/join/{classId}`. Expected: Meeting SDK starts with the instructor as **host**.
3. In a separate browser session, sign in as the reviewer student and open the same `/join/{classId}`. Expected: Meeting SDK joins as a **participant**.
4. Confirm Mute / Video / Participants / Chat / Share Screen / Leave Class via Zoom’s toolbar; Leave Class via AviatorPass dock; rejoin.
5. The student still cannot open `/instructor/profile`.

### Optional Z0xA steps (Instructor OAuth — separate app)

1. Sign in as the reviewer instructor at https://www.aviatorpass.com/instructor/profile and choose Connect Zoom.
2. Authorize a dedicated personal Zoom user (never `ceo@aviatorpass.com`, never a customer Zoom account).
3. Confirm Connected and `personalZoomReady` true — required for Z0xA proof only, not for centralized Classroom VGTQ.

Until host + student live joins have been completed with A/V, this plan does not claim an end-to-end Meeting SDK PASS.

## Expected results that are not yet verified

- A reviewer instructor creates a Zoom meeting.
- The instructor starts and hosts that meeting in the embedded Meeting SDK.
- The student joins the same meeting through the embedded Meeting SDK.
- The instructor ends the meeting and the session status updates.

The blocker is the separate instructor OAuth application. `POST /api/classes` for the reviewer instructor returns HTTP 409: `Please connect your Zoom account before creating a live class.` That connection uses AviatorPass for Zoom, whose production Client ID is not the verified Production Client ID `7z2krfWYQWCi20C0FRZ0xA`. No valid test meeting was available for the reviewer accounts.

## Troubleshooting

| What you see                            | What it means                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Login returns to the instructor profile | The address was `/instructor/profile`. Use `/join` for this application.               |
| No class is ready                       | No assigned class exists. The Meeting SDK has nothing to join.                         |
| HTTP 409 connect your Zoom account      | Instructor OAuth is not connected. This is not a Meeting SDK signature failure.        |
| Zoom error 3712                         | Meeting SDK Client ID and Client Secret are not a matching pair, or Embed is disabled. |
| Zoom error 3000                         | The host Zoom user is already in another meeting.                                      |
| Access denied                           | A student opened an instructor route.                                                  |

## Marketplace fields to update manually

Update these on the **Meeting SDK** application only. Do not submit the application until the account owner approves.

| Marketplace field              | Value                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App name                       | AviatorPass Classroom for Zoom                                                                                                                                    |
| Short description              | Enter a scheduled AviatorPass class in the browser. Instructors host and students attend inside AviatorPass.                                                      |
| Long description               | Use the four paragraphs in `features/zoom/content/meeting-sdk-public.ts` (`MEETING_SDK_LISTING_PARAGRAPHS`). Do not write that Zoom owns or endorses AviatorPass. |
| Direct Landing URL             | https://www.aviatorpass.com/join                                                                                                                                  |
| Documentation URL              | https://www.aviatorpass.com/integrations/zoom                                                                                                                     |
| Privacy policy                 | https://www.aviatorpass.com/legal/privacy                                                                                                                         |
| Terms                          | https://www.aviatorpass.com/legal/terms                                                                                                                           |
| Support email                  | support@aviatorpass.com                                                                                                                                           |
| OAuth scopes on this app       | None. Remove any user-managed scopes from this Meeting SDK application.                                                                                           |
| OAuth redirect URL on this app | Leave unset. Do not copy `https://www.aviatorpass.com/api/integrations/zoom/callback` onto this application.                                                      |
