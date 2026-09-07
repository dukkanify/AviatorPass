# Zoom General OAuth — instructor live-class integration

Production-ready Zoom integration for AviatorPass / ATPL PASS. Instructors connect their own Zoom account. Live classes then create, update, delete, and synchronise Zoom meetings automatically.

Runtime store (JSON mode): `.data/aep-zoom.json`  
SQL: `database/migrations/031_zoom_integrations.sql`

## 1. Files created

| Path                                                 | Role                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| `types/zoom-oauth.ts`                                | Integration, profile, job, and event types |
| `services/zoom/config.ts`                            | Env-only Zoom OAuth configuration          |
| `services/zoom/crypto.ts`                            | AES-256-GCM token encryption               |
| `services/zoom/store.ts`                             | `zoom_integrations` JSON repository        |
| `services/zoom/client.ts`                            | Zoom REST client + meeting payload         |
| `services/zoom/oauth-service.ts`                     | Connect, callback, refresh, disconnect     |
| `services/zoom/meeting-service.ts`                   | Create / update / delete / sync meetings   |
| `services/zoom/queue.ts`                             | Background job handlers                    |
| `services/zoom/notifications.ts`                     | In-app + email meeting notices             |
| `services/zoom/events.ts`                            | Domain events + outbound webhooks          |
| `services/zoom/logging.ts`                           | Ops + activity logs (no secrets)           |
| `services/zoom/policy.ts`                            | Ownership and viewer sanitisation          |
| `services/zoom/middleware.ts`                        | Instructor route guard                     |
| `services/zoom/webhook-service.ts`                   | Marketplace webhook verify + lifecycle     |
| `app/api/integrations/zoom/connect/route.ts`         | OAuth start                                |
| `app/api/integrations/zoom/callback/route.ts`        | OAuth callback                             |
| `app/api/integrations/zoom/status/route.ts`          | Connection status                          |
| `app/api/integrations/zoom/disconnect/route.ts`      | Disconnect                                 |
| `app/api/integrations/zoom/sync/route.ts`            | Manual sync                                |
| `app/api/integrations/zoom/webhook/route.ts`         | Zoom webhooks                              |
| `features/zoom/components/instructor-zoom-panel.tsx` | Instructor dashboard panel                 |
| `features/zoom/components/meeting-countdown.tsx`     | Join-page countdown                        |
| `database/migrations/031_zoom_integrations.sql`      | Postgres schema                            |
| `tests/unit/zoom-oauth.test.ts`                      | Automated coverage                         |
| `docs/ZOOM_OAUTH_INTEGRATION.md`                     | This document                              |

## 2. Files modified

| Path                                                                        | Change                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `config/env.ts`                                                             | `ZOOM_REDIRECT_URI`, `ZOOM_BASE_URL`, scopes, secret token |
| `types/classes.ts`                                                          | Meeting host/status fields; `finished` reminder            |
| `types/api-platform.ts`                                                     | Zoom job types                                             |
| `types/notifications.ts`                                                    | `zoom.meeting.*` catalog entries                           |
| `constants/activity-actions.ts`                                             | OAuth / sync / webhook actions                             |
| `services/classes/zoom-service.ts`                                          | Prefer instructor OAuth; S2S/mock fallback                 |
| `services/classes/class-service.ts`                                         | Host-aware detail, field-change updates, delete notices    |
| `services/classes/reminder-service.ts`                                      | Starts-soon + finished Zoom notices                        |
| `services/api-platform/queue-service.ts`                                    | Dispatches Zoom jobs                                       |
| `app/api/classes/[id]/route.ts`                                             | Passes viewer into class detail                            |
| `features/dashboard/instructor-dashboard-view.tsx`                          | Zoom Integration section                                   |
| `features/classes/components/class-detail-view.tsx`                         | Start / copy / status / participants                       |
| `features/classes/components/join-class-client.tsx`                         | Countdown, Upcoming/Live/Finished, Join Zoom               |
| `features/learning/components/student-dashboard/student-dashboard-view.tsx` | Join Zoom label                                            |
| `.env.example` / `.env.production.example`                                  | New Zoom variables                                         |
| `docs/LIVE_CLASSES_ZOOM.md`                                                 | Instructor OAuth notes                                     |
| `docs/ENVIRONMENT_SETUP.md`                                                 | New env vars                                               |
| `docs/DOCUMENTATION_INDEX.md`                                               | Index entry                                                |

Existing Server-to-Server Zoom (bookings / mock-exam standalone meetings) is unchanged and remains the fallback when an instructor has not connected Zoom.

## 3. Database migrations

`database/migrations/031_zoom_integrations.sql`

- Table `zoom_integrations`: `id`, `user_id` (unique), `zoom_user_id` (unique), `zoom_email`, encrypted `access_token` / `refresh_token`, `expires_at`, `connected_at`, `last_sync_at`, timestamps, status, cached profile.
- Extra columns on `zoom_meetings` for host, timezone, duration, start time, status, OAuth owner, participant count.

JSON mode uses `.data/aep-zoom.json` with the same fields.

## 4. API routes

| Method  | Path                                | Auth                         | Purpose                                                      |
| ------- | ----------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| GET     | `/api/integrations/zoom/connect`    | Instructor (`zoom.sessions`) | Redirect to Zoom OAuth                                       |
| GET     | `/api/integrations/zoom/callback`   | State-signed                 | Exchange code, store tokens, redirect to dashboard           |
| GET     | `/api/integrations/zoom/status`     | Instructor                   | Connection status (no tokens)                                |
| POST    | `/api/integrations/zoom/disconnect` | Instructor                   | Revoke + delete integration                                  |
| POST    | `/api/integrations/zoom/sync`       | Instructor                   | Refresh tokens, profile, meeting status                      |
| GET     | `/api/integrations/zoom/webhook`    | None                         | `405` JSON (reachability; Zoom/browser must not land on `/`) |
| OPTIONS | `/api/integrations/zoom/webhook`    | None                         | `204` with `Allow: POST, OPTIONS`                            |
| POST    | `/api/integrations/zoom/webhook`    | Zoom HMAC                    | URL validation + meeting lifecycle                           |

Existing: `GET /api/zoom/status` (platform S2S, Super Admin), `/api/classes/:id/join` (student/instructor join info).

## 5. Environment variables

Never hardcode credentials. Set in Vercel / `.env.local` only.

```
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://www.aviatorpass.com/api/integrations/zoom/callback
ZOOM_BASE_URL=https://api.zoom.us/v2
ZOOM_SECRET_TOKEN=
ZOOM_WEBHOOK_SECRET=
ZOOM_OAUTH_SCOPES=
ZOOM_ACCOUNT_ID=
```

| Variable              | Required for instructor OAuth | Notes                                    |
| --------------------- | ----------------------------- | ---------------------------------------- |
| `ZOOM_CLIENT_ID`      | Yes                           | General OAuth app                        |
| `ZOOM_CLIENT_SECRET`  | Yes                           | General OAuth app                        |
| `ZOOM_REDIRECT_URI`   | Yes in production             | Must match Zoom Marketplace exactly      |
| `ZOOM_BASE_URL`       | Optional                      | Defaults to `https://api.zoom.us/v2`     |
| `ZOOM_SECRET_TOKEN`   | Webhooks                      | Marketplace Secret Token                 |
| `ZOOM_WEBHOOK_SECRET` | Webhooks                      | Alias if Secret Token is stored here     |
| `ZOOM_OAUTH_SCOPES`   | Optional                      | Defaults to granular meeting + user read |
| `ZOOM_ACCOUNT_ID`     | S2S fallback only             | Platform-level meetings                  |

Tokens are encrypted with AES-256-GCM using a key derived from `AUTH_SECRET`.

## 6. Queue jobs

Handled by `services/api-platform/queue-service.ts` → `services/zoom/queue.ts`:

| Type                  | Purpose                                |
| --------------------- | -------------------------------------- |
| `zoom.meeting.create` | Create meeting for a live class        |
| `zoom.meeting.update` | Patch existing meeting (no duplicates) |
| `zoom.meeting.delete` | Delete Zoom meeting + local refs       |
| `zoom.token.refresh`  | Refresh instructor access token        |
| `zoom.sync`           | Profile + meeting status sync          |
| `zoom.notification`   | In-app + email delivery                |

Transient Zoom/network failures retry automatically (up to 4 attempts). Live-class create/update/delete still run in-request so the instructor sees a meeting immediately; jobs cover sync, refresh, and notification delivery.

## 7. Notifications

| Type                                    | Audience                       | Channels                                            |
| --------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `zoom.meeting.created`                  | Instructor + enrolled students | In-app + email                                      |
| `zoom.meeting.updated`                  | Instructor + enrolled students | In-app + email                                      |
| `zoom.meeting.cancelled`                | Instructor + enrolled students | In-app + email                                      |
| `zoom.meeting.starts_soon`              | Instructor + enrolled students | In-app (reminder queue also emails class reminders) |
| `zoom.meeting.finished`                 | Instructor + enrolled students | In-app                                              |
| `zoom.oauth.connected` / `disconnected` | Instructor                     | In-app                                              |

Deleting a live class removes the Zoom meeting and notifies enrolled students.

## 8. Events

Logged via ops + activity (never tokens / start URLs):

`zoom.oauth.success`, `zoom.oauth.failure`, `zoom.oauth.disconnected`, `zoom.meeting.created`, `zoom.meeting.updated`, `zoom.meeting.deleted`, `zoom.token.refreshed`, `zoom.api.error`, `zoom.webhook`, `zoom.sync.completed`.

## 9. Manual testing checklist

1. Set Zoom env vars locally or on Vercel. Confirm the Marketplace redirect URI is exactly `https://www.aviatorpass.com/api/integrations/zoom/callback` (add localhost only if you will test OAuth off production).
2. Sign in as `instructor@aviatorpass.com` (`DemoPass123!` on demo).
3. Open **Instructor dashboard** → **Zoom Integration**.
4. Click **Connect** and complete Zoom consent. Confirm email, connected since, and status **Connected**.
5. Schedule a live class. Confirm a Zoom meeting exists (Meeting ID, join URL, passcode). Instructor sees **Start meeting**; start URL is never shown to students.
6. Edit date, time, duration, or title. Confirm the same Zoom meeting ID is updated (no second meeting).
7. As a student enrolled on the class, open `/join/{id}`. Confirm date, time, countdown, **Join Zoom**, status Upcoming/Live/Finished, and no start URL.
8. Cancel or delete the class. Confirm Zoom meeting is gone and students are notified.
9. Click **Sync now**, then **Disconnect**, then **Reconnect**.
10. Leave Zoom env unset: live classes still create **mock** meetings (existing fallback).

## 10. Production deployment steps

1. In Zoom Marketplace, publish/activate the **General OAuth** app.
2. Add redirect URI: `https://www.aviatorpass.com/api/integrations/zoom/callback`.
3. Add webhook endpoint: `https://www.aviatorpass.com/api/integrations/zoom/webhook`.
4. Set Vercel Production env vars listed in section 5. Do **not** commit secrets.
5. Apply `031_zoom_integrations.sql` if Postgres is in use.
6. Deploy `main` (or this PR) and confirm `/api/health?ready=1`.
7. Connect one instructor account and schedule a 15-minute test class.

## 11. Remaining manual configuration

Zoom Marketplace (cannot be done from this repo):

- Allowlist the production redirect URI.
- Grant granular scopes: `user:read:user`, `meeting:write:meeting`, `meeting:read:meeting`, `meeting:update:meeting`, `meeting:delete:meeting`, `meeting:read:list_meetings`.
- Event subscriptions: `meeting.started`, `meeting.ended`, `meeting.deleted`, plus URL validation.
- Optional dashboard metrics scope if live participant counts should appear (otherwise count stays “—”).
- Add `http://localhost:3000/api/integrations/zoom/callback` only if local OAuth testing is required.

Local/demo without Zoom credentials continues to use mock meetings. S2S (`ZOOM_ACCOUNT_ID`) remains available for platform-level / booking meetings.
