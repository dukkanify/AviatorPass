# Plan: `meeting:read:list_meetings` on CEO S2S only

**Status:** AWAITING OWNER APPROVAL — **not executed**  
**Date:** 28 October 2026 (Asia/Dubai)  
**Target app:** Zoom **Server-to-Server OAuth** for AviatorPass platform host (`ZOOM_S2S_CLIENT_ID` suffix `uX3Q`, account `ceo@aviatorpass.com`)  
**Out of scope:** Classroom Meeting SDK (`VGTQ`), Instructor OAuth (`Z0xA`), Marketplace submit/withdraw

## Why

Production clear-live / release-host-lock call:

`GET /users/{host}/meetings?type=live`

returns Zoom **HTTP 400 / code 4711**:

`does not contain scopes:[meeting:read:list_meetings, meeting:read:list_meetings:admin]`

AviatorPass previously treated that as an empty list. Code now surfaces `liveListReadable: false`. Without this scope, ops cannot see whether Error **3000** is caused by another live session on CEO.

This scope does **not** by itself fix Error 3000; it only restores visibility so recovery can target the right meeting without guessing.

## Change (when approved)

1. Zoom Marketplace / Zoom App Marketplace → **Server-to-Server** app used by AviatorPass (CEO account) → Scopes.
2. Add **only**: `meeting:read:list_meetings`
   - If Zoom’s S2S catalog only offers the admin/list variant for this app type, use the variant Zoom documents for S2S account apps (`meeting:read:list_meetings:admin`) — prefer the least privilege that makes `type=live` succeed.
3. Do **not** add scopes to VGTQ or Z0xA for this issue.
4. Activate / save scopes on the S2S app; wait for Zoom token refresh (or restart so AviatorPass mints a new S2S token).
5. No rotation of Client ID/Secret or Account ID unless Zoom requires re-activation after scope change.

## Impact

| Area                                       | Effect                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| clear-live                                 | Can list live meetings; `liveListReadable: true` when grant succeeds                                  |
| Error 3000                                 | Still a host-concurrency SDK error; visibility enables safer, targeted end of **ghost** sessions only |
| Customer meetings                          | No automatic end; existing in-window protections remain                                               |
| Classroom VGTQ / Z0xA Marketplace listings | Unchanged                                                                                             |

## Verification

1. Super Admin → Platform Settings → Clear live meetings (or `POST /api/admin/zoom/clear-live`).
2. Expect `liveListReadable: true` and no 4711 in `liveListErrors`.
3. `GET /api/zoom/status` still healthy; host ZAK still ready.
4. Isolated reviewer `/join/{classId}` host join — record whether 3000 persists when live list is empty **and** readable.

## Rollback

1. Remove `meeting:read:list_meetings` (and admin variant if added) from the S2S app.
2. Re-activate; confirm new tokens omit the scope.
3. App continues with write-only clear-live + `liveListReadable: false` messaging (current safe behavior).

## Approval gate

Do **not** apply this scope change until the account owner explicitly approves this plan.
