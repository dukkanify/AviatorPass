# AviatorPass Zoom Marketplace — Final Review Test Plan

Published for reviewers at:

https://www.aviatorpass.com/integrations/zoom-marketplace-review

Updated: 22 October 2026

This document is the single consolidated English test plan for the October 22 Zoom Marketplace review. Passwords and secrets are not included. Do not submit either Marketplace application until the account owner approves.

The full sections live in `features/zoom/content/marketplace-final-review.ts` and on the public URL above. Summary for operators:

## Two applications

| Application                    | Role              | Landing                                        | Credentials                                                         |
| ------------------------------ | ----------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| AviatorPass Classroom for Zoom | Meeting SDK embed | https://www.aviatorpass.com/join               | `ZOOM_CLIENT_*`                                                     |
| AviatorPass for Zoom           | Instructor OAuth  | https://www.aviatorpass.com/instructor/profile | `ZOOM_INSTRUCTOR_*` (Production Client ID `7z2krfWYQWCi20C0FRZ0xA`) |

## Scopes retained (Instructor OAuth only)

- `user:read:user` → `GET /users/me`
- `meeting:write:meeting` → `POST /users/me/meetings`
- `meeting:read:meeting` → `GET /meetings/{id}`
- `meeting:update:meeting` → `PATCH /meetings/{id}`
- `meeting:delete:meeting` → `DELETE /meetings/{id}`

## Scopes / config to remove manually

- Any admin or master Create a Meeting scope (`meeting:write:meeting:admin` or equivalent)
- All user OAuth scopes on the Meeting SDK application
- Meetings product Surface if the app does not open inside Zoom Meetings
- Custom Form (AviatorPass does not use it)

## Reviewer accounts

- Instructor: `zoom.reviewer.instructor@aviatorpass.com`
- Student: `zoom.reviewer.student@aviatorpass.com`

Password delivery: Super Admin → Users → set temporary password → paste only into Zoom’s private Account credentials field.

## Blockers

1. Instructor personal Zoom not connected → reviewer classroom returns `oauth_not_connected`.
2. Embedded host and participant Meeting SDK joins are not completed until item 1 is fixed.

## Production credential status (verified 22 October 2026 Asia/Dubai)

- `ZOOM_INSTRUCTOR_CLIENT_ID` matches Production Client ID `7z2krfWYQWCi20C0FRZ0xA` (suffix `Z0xA`, length 22).
- `ZOOM_INSTRUCTOR_CLIENT_SECRET` pairs with that Client ID (Zoom returns `invalid_grant` on a dummy code — not `invalid_client`).
- Connect Zoom authorize URL uses that Client ID, callback `https://www.aviatorpass.com/api/integrations/zoom/callback`, and signed state.
