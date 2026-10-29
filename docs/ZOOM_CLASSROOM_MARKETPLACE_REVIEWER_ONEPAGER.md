# AviatorPass Classroom for Zoom (VGTQ) — Reviewer one-pager

**App:** AviatorPass Classroom for Zoom (Meeting SDK Client ID suffix **VGTQ**)  
**Site:** https://www.aviatorpass.com  
**Public review doc:** https://www.aviatorpass.com/integrations/zoom-classroom-review  
**Updated:** 29 October 2026 (Asia/Dubai)

Passwords are **not** in this file. Owner pastes them only into Zoom Marketplace → private **Account credentials**.

## What this app does

Embeds the live class inside AviatorPass `/join/{classId}` via Meeting SDK.  
Meetings are created by the **platform Server-to-Server** host (`ceo@aviatorpass.com`). Instructors do **not** need Connect Zoom / `personalZoomReady` for this Classroom review.

## What this app is not

**AviatorPass for Zoom (Instructor OAuth, suffix Z0xA)** is a **separate, optional** app for personal instructor Connect Zoom. It is **not** required to review Classroom VGTQ and must not block Classroom approval.

## Reviewer accounts

| Role       | Name          | Email                                      |
| ---------- | ------------- | ------------------------------------------ |
| Instructor | Riley Okonkwo | `zoom.reviewer.instructor@aviatorpass.com` |
| Student    | Jordan Hale   | `zoom.reviewer.student@aviatorpass.com`    |

## Test steps (Classroom only)

1. Open https://www.aviatorpass.com/login — sign in as the **instructor** reviewer.
2. From **Instructor → Classes** (or Schedule), open the Marketplace reviewer classroom, or use `/join/1bd88dfd5a8d69fc5c78d1d3d1e90af3` after Super Admin `POST /api/admin/zoom/reviewer-classroom`.
3. Allow camera/microphone. Expect **In the meeting** with instructor as **host**.
4. Confirm Zoom toolbar: Mute, Video, Participants, Chat, Share Screen; AviatorPass **Leave Class**.
5. In a **second** browser/profile or device, sign in as the **student** reviewer → **Student → Schedule** → Join Zoom (same class). Expect participant (no HOST).
6. **Manual real-device checks (required for A/V quality):** two-way audio, two-way video, Chat send/receive, Participants list for host, host Share Screen visible to student, student Leave Class then rejoin.
7. Student must get Access denied on `/instructor/profile`.

## Owner pre-submit checklist (Marketplace console)

1. Embed → Meeting SDK **ON**.
2. Disable unused **Meetings** surface; remove unused **Custom Form** entirely (0 fields alone is not enough — remove the feature).
3. Do not invent unused OAuth scopes on Classroom; if Production Scopes shows “Select at least one scope”, use Zoom Support guidance first (see `docs/ZOOM_CLASSROOM_MARKETPLACE_SCOPE_RESOLUTION.md`).
4. Paste reviewer emails + temporary passwords into **private** Account credentials only.
5. Submit **only** after owner approval.

## Known ops note (not a reviewer action)

If join shows Zoom **Error 3000**, the platform Zoom host already has another live meeting. AviatorPass clear-live **lists** live meetings and ends only **known local ghosts** or **explicit** meeting numbers — never unknown Zoom live IDs and never in-window customer classes. Owner may need to leave leftover Zoom desktop/web sessions on `ceo@aviatorpass.com`.
