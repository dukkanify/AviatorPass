# AviatorPass for Zoom — review package

This package records what production verified on 19 October 2026 and what the account owner must still supply. It does not submit the Marketplace application.

Production deployment: `dpl_ZqnnvUECMjy4RvNtZMgqJjRRaoLy`  
Git SHA: `99fbdb2ed5a6809eb12d2f4a92743316b0087e58`  
Branch: `cursor/zoom-marketplace-login-return-dfeb`  
Site: https://www.aviatorpass.com

## Direct Landing URL

https://www.aviatorpass.com/instructor/profile

Verified in a fresh browser: an unauthenticated visit opens `/login?next=%2Finstructor%2Fprofile`. After the dedicated instructor signs in, the browser returns to `/instructor/profile`.

## Reviewer accounts

| Role       | Name          | Email                                      |
| ---------- | ------------- | ------------------------------------------ |
| Instructor | Riley Okonkwo | `zoom.reviewer.instructor@aviatorpass.com` |
| Student    | Jordan Hale   | `zoom.reviewer.student@aviatorpass.com`    |

Both accounts are active and profile-complete. Passwords are not in this repository. The account owner pastes them only into Zoom’s private Account credentials field. Existing customer accounts were not changed.

Verified instructor profile: Zoom Account **Not Connected**, connected email empty, **Connect Zoom** available, Sync and Disconnect disabled.

Verified student: `/student/dashboard` after login. `/instructor/profile` ends at `/access-denied` and does not show Zoom Account.

## Why production uses a Client ID ending in `dhiQ`

`ZOOM_INSTRUCTOR_CLIENT_ID` on Vercel production (environment id `6Kx6VN99t8NXKvbu`) was created at `2026-10-15T02:36:37.915Z` and has not been updated. Its value is a 21-character Client ID whose public suffix is `dhiQ`.

`ZOOM_INSTRUCTOR_CLIENT_SECRET` on production (environment id `Di7sgE8nLp5UOqJ4`) was created at `2026-10-15T02:57:26.962Z` and has not been updated. Zoom accepts that secret with the `dhiQ` client (`invalid_grant` on a dummy authorization code). It rejects that secret with Production Client ID `7z2krfWYQWCi20C0FRZ0xA` (`invalid_client`).

The same check rejects the Meeting SDK secret and the Server-to-Server secret. `ZOOM_SDK_SECRET` and `ZOOM_MEETING_SDK_SECRET` are unset. The instructor secret is not equal to either of the other stored secrets. The instructor Client ID is not equal to the Meeting SDK Client ID (suffix `VGTQ`) or the Server-to-Server Client ID (suffix `uX3Q`).

Those older applications were stored earlier: Meeting SDK `ZOOM_CLIENT_ID` on 1 October 2026, Server-to-Server on 2 October 2026. The `dhiQ` client was stored later, as the new instructor variable. Commit `9e349d3` (15 October 2026, 02:41 UTC) names that variable as General app 29, five minutes after the Client ID was saved. The integration notes from that morning told operators to store Development credentials while the app was unpublished. Zoom’s sign-in page does not print the app name, so this repository cannot prove the Marketplace display name of the `dhiQ` client. It is not the Meeting SDK application and it is not the Server-to-Server application.

The Production Client ID `7z2krfWYQWCi20C0FRZ0xA` was not written into `ZOOM_INSTRUCTOR_CLIENT_ID`. Credentials were not changed.

## OAuth state

Signed state is still required. An empty callback is rejected as `missing_code`. A callback that has a code and no state is rejected as `missing_state`. Neither path writes a Zoom connection. Production correlation `zoa_mS97FLBb9LJPtA` (19 October 2026, 06:02 UTC) was an empty callback: no code, no state, and no Zoom error. An earlier callback, `zoa_l7L-G5WOrESBDQ`, arrived with a code and no state and was rejected the same way.

The current Connect request still sends `state` (192 characters), `response_type=code`, and `redirect_uri=https://www.aviatorpass.com/api/integrations/zoom/callback`. It does not send `scope`. The client on that request is the `dhiQ` client, not `7z2krfWYQWCi20C0FRZ0xA`.

## Publication path

Publish the General app (app 29) with its Production credentials and this redirect URL:

`https://www.aviatorpass.com/api/integrations/zoom/callback`

Also add that URL to the Production OAuth allow list. The same URL must be on the Production environment, not only on Development.

Do not enroll beta testers as a substitute for the Production Client ID and Secret. Do not submit the Marketplace application until the account owner approves the submission.

Required user-managed scopes: `user:read:user`, `meeting:write:meeting`, `meeting:read:meeting`, `meeting:update:meeting`, `meeting:delete:meeting`.

## EU business identity

Use only the facts below in the Marketplace company profile. Registration numbers are not in this repository and must not be invented.

| Field                          | Value stored in AviatorPass               |
| ------------------------------ | ----------------------------------------- |
| Product name                   | Aviator Pass                              |
| Legal name stored in the app   | Aviator Pass                              |
| Website                        | https://www.aviatorpass.com               |
| Privacy policy                 | https://www.aviatorpass.com/legal/privacy |
| Terms                          | https://www.aviatorpass.com/legal/terms   |
| Support                        | support@aviatorpass.com                   |
| Controller contact             | info@aviatorpass.com                      |
| Vendor contact in handover     | dukkanify@gmail.com                       |
| Governing law in the Terms     | United Arab Emirates                      |
| Locations named in the product | Dubai, Copenhagen, Kuwait, Qatar          |
| Hosting account label          | dukkanify-technology-llcs-projects        |

Missing, and required from the account owner before the company profile can be completed: the registered legal entity name, the registered address, and the commercial registration or VAT number that Zoom’s EU business-identity form asks for.

## Reviewer responses

Paste these only after the Production secret is installed and a personal Zoom authorization has been retested. They describe the verified product behavior. They do not claim the untested meeting lifecycle.

**What should the reviewer open first?**  
https://www.aviatorpass.com/instructor/profile  
An unsigned visitor is sent to the sign-in page and returned to that profile after a successful instructor login.

**Which accounts should the reviewer use?**  
Instructor Riley Okonkwo, `zoom.reviewer.instructor@aviatorpass.com`. Student Jordan Hale, `zoom.reviewer.student@aviatorpass.com`. Passwords are in the private Account credentials field. The instructor then authorizes the reviewer’s own Zoom user on Zoom’s sign-in page. AviatorPass does not connect the platform administrator account.

**What does Connect Zoom do?**  
It sends the instructor to `https://zoom.us/oauth/authorize` with `response_type=code`, the Instructor OAuth Client ID, the production callback, and a signed `state`. After Zoom redirects back with both the code and that state, AviatorPass stores the connection on that instructor only.

**What should the reviewer see before authorization?**  
Zoom Account status Not Connected, no connected email, and a Connect Zoom control. Creating a live class returns HTTP 409: `Please connect your Zoom account before creating a live class.`

**What should the reviewer see after authorization?**  
The profile shows the reviewer’s Zoom email and Connected. The instructor can create a class, start it as host from `/join/{classId}`, and the student can join the same class from Schedule through the embedded Meeting SDK. Ending the meeting is done from the classroom. This lifecycle has not been executed on production because the reviewer instructor is still disconnected.

**Can a student connect Zoom or open instructor settings?**  
No. A signed-in student who opens `/instructor/profile` is sent to `/access-denied`.

## Manual action for the account owner

1. Open Zoom Marketplace → Manage → the AviatorPass General app → the **Production** environment, not Development.
2. On App Credentials, confirm the Client ID is exactly `7z2krfWYQWCi20C0FRZ0xA`.
3. Copy the Client Secret shown on that same Production card. Do not copy the Development secret, the Meeting SDK secret, or the Server-to-Server secret.
4. In Vercel → project `aviatorpass` → Settings → Environment Variables, set only the **Production** values:
   - `ZOOM_INSTRUCTOR_CLIENT_ID` = `7z2krfWYQWCi20C0FRZ0xA`
   - `ZOOM_INSTRUCTOR_CLIENT_SECRET` = the Production secret from step 3
5. Do not paste that secret into `ZOOM_CLIENT_SECRET`, `ZOOM_S2S_CLIENT_SECRET`, Git, chat, or this document.
6. Leave `ZOOM_REDIRECT_URI` as `https://www.aviatorpass.com/api/integrations/zoom/callback`, and confirm that exact URL is on the Production OAuth redirect and allow list.
7. Redeploy production. Then open Super Admin `GET /api/zoom/status` and confirm `configuredMatchesExpectedProductionClientId` is true and `expectedProductionClientSecretMatch.ZOOM_INSTRUCTOR_CLIENT_SECRET` is true before any classroom test.
8. Sign in as `zoom.reviewer.instructor@aviatorpass.com`, choose Connect Zoom, and authorize a Zoom user that is not `ceo@aviatorpass.com` and not a customer account.
9. Fill the Marketplace EU business-identity form with the registered legal name, address, and registration or VAT number. Those values are not in the application.
10. Do not submit the Marketplace application until you approve the submission.
