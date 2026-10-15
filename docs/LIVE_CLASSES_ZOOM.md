# Live Classes, Zoom & Scheduling

MASTER TASK 007 — Live class management with Zoom integration.

## Scope

Included:

- Live class CRUD (create, edit, duplicate, cancel, reschedule, soft delete)
- Zoom Server-to-Server OAuth integration with **secure mock fallback**
- Scheduling engine (one-time, daily, weekly, monthly) + conflict detection
- Calendar views (month / week / day / agenda) permission-filtered
- Reminder queue (24h / 2h / 15m / live now) — configurable in Platform Settings
- Attendance foundation (present / late / absent / excused / unknown)
- Recording metadata architecture (no video processing)
- Dashboard widgets + activity logging + in-app notifications

**Not included:** quizzes, certificates, payments, wallets, community.

## Credentials

Set server env only (never exposed to the client):

```
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_INSTRUCTOR_CLIENT_ID=
ZOOM_INSTRUCTOR_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://www.aviatorpass.com/api/integrations/zoom/callback
ZOOM_BASE_URL=https://api.zoom.us/v2
ZOOM_SECRET_TOKEN=
ZOOM_ACCOUNT_ID=
ZOOM_S2S_CLIENT_ID=
ZOOM_S2S_CLIENT_SECRET=
ZOOM_WEBHOOK_SECRET=
```

Instructors connect their own Zoom account via **Instructor OAuth** (`ZOOM_INSTRUCTOR_CLIENT_ID` / `ZOOM_INSTRUCTOR_CLIENT_SECRET`, `/api/integrations/zoom/connect`). Live classes then call `POST /users/me/meetings` with that instructor’s token.

`ZOOM_ACCOUNT_ID` + `ZOOM_S2S_CLIENT_ID` + `ZOOM_S2S_CLIENT_SECRET` are Server-to-Server OAuth for platform/booking meetings (create / update / delete only).

In-app join uses the **Meeting SDK** app (`ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`). Enable **Features → Embed → Meeting SDK** on that app. Copy **both** Client ID and Client Secret from the **same** app’s **Production** App Credentials (Dev/Prod pairs must not be mixed). Do not reuse Instructor OAuth (`ZOOM_INSTRUCTOR_*`) or S2S secrets for Meeting SDK JWTs — a mismatched pair causes Zoom error **3712 Signature is invalid**. Super Admin → `/api/zoom/status` reports `meetingSdk.credentialPairValid` without exposing secrets.

When neither instructor OAuth nor S2S is available, meetings are created in **mock mode** with join URLs under `/join/[id]`.

See `docs/ZOOM_OAUTH_INTEGRATION.md`.

Platform Settings → Zoom configures host email, waiting room, passcode, meeting/webinar defaults.

## Runtime store

`.data/aep-classes.json`

Production: `database/migrations/006_live_classes_zoom.sql`

## Permissions

| Role        | Capability                                                          |
| ----------- | ------------------------------------------------------------------- |
| Super Admin | Full (`classes.manage`, `system.zoom`)                              |
| Admin       | Manage all classes                                                  |
| Instructor  | Own sessions (`zoom.sessions`, `attendance.manage`, `schedule.own`) |
| Student     | View/join enrolled (`zoom.classes`, `calendar.own`)                 |

## Key routes

- `/super-admin/classes`, `/admin/classes`, `/instructor/classes`
- `/instructor/calendar`, `/student/calendar`
- `/join/[id]` — seamless join experience
- APIs under `/api/classes/*`, `/api/zoom/status`, `/api/integrations/zoom/*`

## Services

`zoom-service`, `class-service`, `schedule-service`, `attendance-service`, `reminder-service`, `calendar-service`, `recording-service`
