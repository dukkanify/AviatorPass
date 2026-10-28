# Centralized Zoom hosting — minimal plan (current release)

**Date:** 28 October 2026 (Asia/Dubai)  
**Decision:** Live classes use platform Server-to-Server Zoom (`ceo@aviatorpass.com`) by default. Personal Instructor OAuth remains optional.  
**Marketplace:** Do not submit without owner approval. Do not recreate apps or rotate credentials.

## Architecture

| Integration | Role this release |
| --- | --- |
| CEO / S2S (`ZOOM_S2S_*`, account email `ceo@aviatorpass.com`) | Create live-class + booking meetings; supply meeting `start_url` for server-side host ZAK |
| Meeting SDK Classroom (`ZOOM_CLIENT_*`, suffix `VGTQ`) | JWT signatures for `/join` embed only |
| Instructor OAuth (`ZOOM_INSTRUCTOR_*`, suffix `Z0xA`) | Optional future per-instructor hosting — code/credentials retained |

## Security

- Instructors never receive CEO passwords, S2S client secrets, or raw unrestricted host credentials.
- Students never receive `start_url` / ZAK.
- Host ZAK is minted only in `POST /api/zoom/in-app-session` for authorized AviatorPass hosts.

## Concurrent meetings / licensing

- AviatorPass blocks overlapping schedules for the same instructor (`detectScheduleConflicts`).
- S2S create uses `chooseZoomHostUser` to prefer a free Zoom user on the account when another lecture already occupies a host.
- Host join probes `zoomHostBlockedByAnotherLiveMeeting` (Zoom error 3000 mitigation).
- **Licensing limit:** A single licensed Zoom user typically hosts **one** concurrent meeting. Multiple simultaneous live classes on one CEO user may fail or conflict unless the Zoom account has additional licensed hosts. Prefer staggered schedules or additional Zoom users on the same S2S account.

## Code changes (minimal)

1. `createMeetingForClass` — personal OAuth if ready, else `createZoomApiMeeting` (S2S).  
2. `createLiveClass` — allow when personal OAuth **or** S2S creds present.  
3. `assessReviewerClassroom` — ready when `platformS2SReady`.  
4. Export `zoomCredsPresent`; expose `platformHostingReady` on status APIs; class form allows create when platform hosting is ready.  
5. Reviewer docs updated to the tested centralized workflow.

## Production verification (28 October 2026 Asia/Dubai)

Deploy `693de2c` → `dpl_5aKr21vwdpssstiWdQCyPTd5BQdB` on www.aviatorpass.com.

| Check | Result |
| --- | --- |
| `platformHostingReady` | true |
| Reviewer classroom without personal OAuth | PASS — meeting on `ceo@aviatorpass.com` |
| Host `POST /api/zoom/in-app-session` | role 1, signature + ZAK |
| Student participant session | role 0, signature, no ZAK |
| Student host attempt | no ZAK / no hostSignature |
| Working join URL | `/join/1bd88dfd5a8d69fc5c78d1d3d1e90af3` |
| Marketplace submit | **not performed** |

Evidence: `/opt/cursor/artifacts/centralized-hosting-prod-probe.json`

## Not changed

- CEO connection / S2S secrets  
- Customer meetings (except creating the isolated reviewer class when requested)  
- Marketplace portal settings / submit  
- Personal OAuth codepaths and credentials  

