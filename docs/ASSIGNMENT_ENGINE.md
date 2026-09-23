# Instructor Assignment Engine (CR005)

ATPL journey orchestration for instructor assign/reassign, availability, conflicts, automatic Zoom, and waiting queue.

## Outcomes

| Status                               | Meaning                                                                                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduling_required`                | Instructor assigned; session time not yet set                                                                                                                                                                                          |
| `queued`                             | Waiting queue — conflicts or no open slot                                                                                                                                                                                              |
| `scheduled`                          | Live class created + Zoom meeting provisioned                                                                                                                                                                                          |
| `unable_to_schedule`                 | Exhausted attempts / no capacity in look-ahead. Emails TKI 1 (CGI) and Super Admin.                                                                                                                                                    |
| Instructor **Unable to Schedule**    | After a lecture, the instructor can mark the next session as `scheduling_required`. The student status becomes Scheduling Required. Email + in-app go to TKI 1 and Super Admin (`POST /api/classes/:id/actions` `unable_to_schedule`). |
| Instructor **Schedule Next Session** | After a lecture, the instructor picks date + time (optional homework) and books the next Zoom class. The student is emailed subject, date, time, and join URL (`POST /api/classes/:id/actions` `schedule_next_session`).               |

## Capabilities

- Assign / reassign primary instructor (moves future classes when free)
- Instructor weekly availability + blocks
- Instructor calendar (classes, bookings, blocks, queue)
- Unified conflict detection (live classes, bookings, blocks, windows)
- Automatic Zoom via `createLiveClass` → `createMeetingForClass`
- Waiting queue processor (`POST /api/assignment/process`)

## Paths

| Layer  | Path                                                         |
| ------ | ------------------------------------------------------------ |
| Types  | `types/assignment.ts`                                        |
| Store  | `services/assignment/store.ts` (`.data/aep-assignment.json`) |
| Engine | `services/assignment/engine.ts`                              |
| API    | `/api/assignment`, `/api/assignment/process`                 |
| CGI UI | `/cgi/assignment`                                            |
| SQL    | `database/migrations/022_instructor_assignment_engine.sql`   |

CGI “Change instructor” routes through `reassignInstructorEngine`.
