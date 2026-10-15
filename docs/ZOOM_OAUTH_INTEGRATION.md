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

| Method  | Path                                | Auth                         | Purpose                                                                               |
| ------- | ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| GET     | `/api/integrations/zoom/connect`    | Instructor (`zoom.sessions`) | Redirect to Zoom OAuth                                                                |
| GET     | `/api/integrations/zoom/callback`   | State-signed                 | Exchange code, store tokens, redirect to dashboard                                    |
| GET     | `/api/integrations/zoom/status`     | Instructor                   | Connection status (no tokens); includes `personalZoomReady` / `sharedPlatformAccount` |
| GET     | `/api/admin/instructors/zoom`       | Instructors manage           | Admin Zoom readiness per instructor                                                   |
| POST    | `/api/admin/zoom/clear-live`        | Super Admin (`system.zoom`)  | End leftover live meetings blocking classroom join                                    |
| POST    | `/api/integrations/zoom/disconnect` | Instructor                   | Revoke + delete integration                                                           |
| POST    | `/api/integrations/zoom/sync`       | Instructor                   | Refresh tokens, profile, meeting status                                               |
| GET     | `/api/integrations/zoom/webhook`    | None                         | `405` JSON (reachability; Zoom/browser must not land on `/`)                          |
| OPTIONS | `/api/integrations/zoom/webhook`    | None                         | `204` with `Allow: POST, OPTIONS`                                                     |
| POST    | `/api/integrations/zoom/webhook`    | Zoom HMAC                    | URL validation + meeting lifecycle                                                    |

Existing: `GET /api/zoom/status` (platform S2S, Super Admin), `/api/classes/:id/join` (student/instructor join info).

## 5. Environment variables

Never hardcode credentials. Set in Vercel / `.env.local` only.

```
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_INSTRUCTOR_CLIENT_ID=
ZOOM_INSTRUCTOR_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://www.aviatorpass.com/api/integrations/zoom/callback
ZOOM_BASE_URL=https://api.zoom.us/v2
ZOOM_SECRET_TOKEN=
ZOOM_WEBHOOK_SECRET=
ZOOM_OAUTH_SCOPES=
ZOOM_ACCOUNT_ID=
ZOOM_S2S_CLIENT_ID=
ZOOM_S2S_CLIENT_SECRET=
```

| Variable                        | Required for instructor OAuth | Notes                                                                                                                                                 |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZOOM_INSTRUCTOR_CLIENT_ID`     | Yes                           | Instructor OAuth General App (e.g. Marketplace app 29)                                                                                                |
| `ZOOM_INSTRUCTOR_CLIENT_SECRET` | Yes                           | Instructor OAuth Client Secret — never reuse Meeting SDK secret                                                                                       |
| `ZOOM_CLIENT_ID`                | Meeting SDK only              | Embedded Meeting SDK JWT `appKey`                                                                                                                     |
| `ZOOM_CLIENT_SECRET`            | Meeting SDK only              | Embedded Meeting SDK JWT secret                                                                                                                       |
| `ZOOM_REDIRECT_URI`             | Yes in production             | Must match Zoom Marketplace exactly                                                                                                                   |
| `ZOOM_BASE_URL`                 | Optional                      | Defaults to `https://api.zoom.us/v2`                                                                                                                  |
| `ZOOM_SECRET_TOKEN`             | Webhooks                      | Marketplace Secret Token                                                                                                                              |
| `ZOOM_WEBHOOK_SECRET`           | Webhooks                      | Alias if Secret Token is stored here                                                                                                                  |
| `ZOOM_OAUTH_SCOPES`             | Optional                      | Defaults: `user:read:user meeting:write:meeting meeting:read:meeting meeting:update:meeting meeting:delete:meeting` (no `meeting:read:list_meetings`) |
| `ZOOM_ACCOUNT_ID`               | S2S create/update/delete      | Server-to-Server Account ID                                                                                                                           |
| `ZOOM_S2S_CLIENT_ID`            | S2S create/update/delete      | Server-to-Server Client ID — never a Meeting SDK JWT                                                                                                  |
| `ZOOM_S2S_CLIENT_SECRET`        | S2S create/update/delete      | Server-to-Server Client Secret                                                                                                                        |

**Invalid scope:** requesting scopes not enabled on the Instructor OAuth app (commonly `meeting:read:list_meetings`) causes Zoom `Invalid scope`. Enable only scopes the app has, or set `ZOOM_OAUTH_SCOPES` to the enabled set.

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
7. Connect one instructor’s **personal** Zoom account (not the platform Host account email) and confirm `personalZoomReady: true` on `/api/integrations/zoom/status`.
8. Schedule a 15-minute test class and run host → student in-app join.

If an instructor previously connected the shared platform / CEO Zoom email, they must **Disconnect Zoom** then **Connect Zoom** with their own login before hosting. Shared-host leftovers that still block join: Super Admin → Platform Settings → Zoom → Clear live meetings (`POST /api/admin/zoom/clear-live`).

## 11. Remaining manual configuration

Zoom Marketplace (cannot be done from this repo):

### Development vs Production credentials (critical for error 4,700 / Marketplace “Something went wrong”)

Zoom General Apps have **separate** Client ID / Secret and **separate** OAuth Redirect URL + Allow List for **Development** and **Production** (Marketplace environment filter).

| AviatorPass `ZOOM_INSTRUCTOR_CLIENT_ID` belongs to… | Configure OAuth Redirect + Allow List under… |
| --------------------------------------------------- | -------------------------------------------- |
| Development Client ID                               | Development environment filter               |
| Production Client ID                                | Production environment filter                |

- While the app is **Draft / unpublished**, use **Development** Client ID + Secret in Vercel and configure the **Development** Redirect URL + Allow List.
- **Development / Local Test** OAuth is restricted: only the app owner and users on that Zoom account (or an approved shareable beta URL) can authorize. A random personal Zoom account will land on `marketplace.zoom.us/error` (“Something went wrong”).
- For any instructor’s personal Zoom account in production, use **Production** Client ID + Secret after the General app is activated/published (or request a shareable beta authorization URL under Marketplace → Production → Beta test).
- Confirm which side Client ID matches via Admin `GET /api/admin/instructors/zoom` → `oauthClientIdSuffix` (last 4 chars only; never log full secrets). Live Instructor OAuth suffix must **not** equal Meeting SDK `meetingSdkClientIdSuffix`.

### Authorize URL (AviatorPass)

AviatorPass builds:

`https://zoom.us/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&state=…`

It does **not** append `scope` by default (matches Zoom Marketplace Local Test / docs). Scopes are taken from the General app’s Scopes page. Set `ZOOM_OAUTH_INCLUDE_AUTHORIZE_SCOPES=true` only for temporary debugging — Zoom has rejected authorize URLs that include scopes.

### Exact allowlist + scopes (Marketplace app 29)

Location: [Zoom Marketplace](https://marketplace.zoom.us/) → **Manage** → General app (app 29) → environment toggle **Development** or **Production** (must match Vercel Client ID).

1. **App credentials** → copy Client ID / Secret into Vercel `ZOOM_INSTRUCTOR_CLIENT_ID` / `ZOOM_INSTRUCTOR_CLIENT_SECRET` (never into `ZOOM_CLIENT_*`).
2. **OAuth Redirect URL** (exact): `https://www.aviatorpass.com/api/integrations/zoom/callback`
3. **OAuth Allow List**: same callback URL; with Strict Mode / subdomain check enabled, also list `https://www.aviatorpass.com` if required — apex `https://aviatorpass.com` does **not** cover `www`.
4. **Scopes** (user-managed, required): `user:read:user`, `meeting:write:meeting`, `meeting:read:meeting`, `meeting:update:meeting`, `meeting:delete:meeting`.  
   Without `user:read:user`, Zoom may authorize and return tokens, but AviatorPass cannot load `/users/me` (error 4711) and Connect fails unless token JWT identity fallback applies. Add `meeting:read:list_meetings` only if enabled on the app.
5. **Local Test** → “Add App Now” as the **app owner** first. If that works but a personal instructor Zoom account fails, the Client ID is still Development-restricted — switch Vercel to **Production** credentials or add the tester to the Zoom account / request a shareable beta URL.
6. Event subscriptions (optional): `meeting.started`, `meeting.ended`, `meeting.deleted`, plus URL validation.
7. Add `http://localhost:3000/api/integrations/zoom/callback` only for local OAuth testing.

If Zoom shows `Invalid redirect: …/callback (4,700)`, AviatorPass already sends the canonical www callback — fix the Marketplace environment that matches the live Client ID.

Local/demo without Zoom credentials continues to use mock meetings. S2S (`ZOOM_ACCOUNT_ID`) remains available for platform-level / booking meetings.
