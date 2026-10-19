# AviatorPass for Zoom — Marketplace reviewer guide

This guide is for Zoom Marketplace reviewers testing **AviatorPass for Zoom** on production. It does not contain passwords. The platform owner pastes the temporary passwords only into Zoom’s private **Account credentials** field. Do not add them to the public app listing, this document, or a Git commit.

Production site: https://www.aviatorpass.com

## Reviewer accounts

| Role       | Name          | Email                                      | Status                   |
| ---------- | ------------- | ------------------------------------------ | ------------------------ |
| Instructor | Riley Okonkwo | `zoom.reviewer.instructor@aviatorpass.com` | Active, profile complete |
| Student    | Jordan Hale   | `zoom.reviewer.student@aviatorpass.com`    | Active, profile complete |

These accounts use dummy contact data. They are separate from customer and demo accounts. Existing customer accounts were not changed.

### Secure credential delivery

1. Passwords are generated on the server when the accounts are prepared and are not stored in Git.
2. The platform owner receives them through this private agent handoff, not through the repository.
3. Paste them into Zoom Marketplace → the app → **Account credentials** (reviewer-only). Leave the public listing empty of passwords.
4. After the review, a Super Admin can set a new password or deactivate these two accounts from **Users**. Do not delete unrelated accounts.

## Direct Landing URL

https://www.aviatorpass.com/instructor/profile

Use a fresh browser session (incognito). An unauthenticated visit redirects to:

`/login?next=%2Finstructor%2Fprofile`

After the instructor signs in, the browser returns to `/instructor/profile`, not the dashboard.

## Instructor login

1. Open the Direct Landing URL in a fresh session.
2. Sign in with the instructor reviewer email and the temporary password delivered privately.
3. Expected: the Profile page opens. Account status shows **Instructor**, **Active**, and **Complete**.
4. A normal visit to https://www.aviatorpass.com/login with no `next` parameter opens `/instructor/dashboard`.

## Student login

1. Open https://www.aviatorpass.com/login in a different fresh session.
2. Sign in with the student reviewer email and the temporary password delivered privately.
3. Expected: `/student/dashboard`.
4. Opening `/instructor/profile` while signed in as the student ends at `/access-denied`. The student does not see the Zoom Account section.

## Connect a personal Zoom account

1. As the instructor, stay on `/instructor/profile`.
2. Expected before any connection: Zoom Account status **Not Connected**, connected email **—**, and a **Connect Zoom** button. Sync and Disconnect stay unavailable. No administrator or placeholder Zoom identity is shown.
3. Choose **Connect Zoom**.
4. Expected: Zoom’s own sign-in page (`https://zoom.us`). The authorize request uses the Instructor OAuth app, `response_type=code`, `redirect_uri=https://www.aviatorpass.com/api/integrations/zoom/callback`, and a `state` value. It does not send a `scope` query parameter.
5. Sign in with a **personal Zoom user that belongs to the reviewer**, then approve the requested permissions.
6. Expected after approval: the browser returns to `/instructor/profile`. Connected email is that personal Zoom user. Status is **Connected**. `personalZoomReady` is true. The email must not be the platform administrator account.
7. To disconnect: on the same Zoom Account card, choose **Disconnect Zoom**. Expected: status returns to **Not Connected** and the connected email clears.

## Create a live training session

1. Connect the instructor’s personal Zoom account first.
2. Open **Live Classes** (`/instructor/classes`).
3. Create a session with dummy details, for example title `Marketplace reviewer sample — ATPL meteorology`, duration 30 minutes, timezone `Asia/Kuwait`, and enroll `zoom.reviewer.student@aviatorpass.com`.
4. Expected: the class is saved and Zoom creates a meeting on the instructor’s authorized account. The meeting host is that Zoom user, not the platform administrator.

## Start the meeting as the instructor

1. Open the class and choose **Join / start**.
2. Expected: the in-app classroom at `/join/{classId}` opens through the embedded Meeting SDK. The instructor joins as host.

## Join the meeting as the student

1. In the student session, open **Schedule** (`/student/schedule`).
2. Open the sample class and choose **Join**.
3. Expected: the same class opens in the embedded Meeting SDK as a participant. The student can see and hear the instructor’s meeting. The student cannot open instructor settings or connect a Zoom host account.

## Disconnect Zoom

On `/instructor/profile`, choose **Disconnect Zoom**, then confirm. Expected: **Not Connected**, empty connected email, and **Connect Zoom** available again. Existing customer Zoom connections are not affected.

## Marketplace account-credentials note

Copy the following into Zoom’s private reviewer note and fill the passwords from the private handoff:

```
App: AviatorPass for Zoom
Site: https://www.aviatorpass.com
Direct Landing URL: https://www.aviatorpass.com/instructor/profile

Instructor
Name: Riley Okonkwo
Email: zoom.reviewer.instructor@aviatorpass.com
Password: <private handoff>

Student
Name: Jordan Hale
Email: zoom.reviewer.student@aviatorpass.com
Password: <private handoff>

The instructor password is for AviatorPass only. Zoom authorization uses the reviewer’s own Zoom user on the Connect Zoom screen.
```

## Known limitations

- Creating or hosting a meeting is blocked until the instructor completes **Connect Zoom** with a personal Zoom user. The production API returns `409` with `Please connect your Zoom account before creating a live class.` No sample meeting was created, so host and student join could not be executed.
- The live Instructor OAuth client is separate from the Meeting SDK client. Its public suffix is `dhiQ` (length 21). It does **not** match the requested Production Client ID ending `0xA` (length 22). The OAuth callback was left unchanged at `https://www.aviatorpass.com/api/integrations/zoom/callback`. Secrets were not regenerated.
- While the Marketplace app is unpublished, Zoom may allow only the app owner or approved beta users to finish authorization. If Connect Zoom reaches Zoom and then shows “Something went wrong”, that is a Marketplace publication / beta-tester restriction, not an AviatorPass login failure.
- This guide does not submit or edit the Marketplace application.
