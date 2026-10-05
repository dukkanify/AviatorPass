/**
 * Upgrade leftover mock Zoom rooms for sessions that start soon.
 * Join paths already upgrade one meeting; this covers lists and cron.
 */

import { readBookingsDb } from "@/services/bookings/store";
import { ensureBookingZoom } from "@/services/bookings/booking-service";
import { readClassesDb } from "@/services/classes/store";
import {
  ensureLiveMeetingForClass,
  isLiveZoomConfigured,
  isPlaceholderZoomMeeting,
} from "@/services/classes/zoom-service";
import { ensureLiveMockExamZoom } from "@/services/mock-exams/booking-service";
import { readMockExamsDb } from "@/services/mock-exams/store";

const DEFAULT_WINDOW_MS = 48 * 60 * 60_000;
const LOOKBACK_MS = 2 * 60 * 60_000;

function inWindow(startsAt: string, now: number, windowMs: number): boolean {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return false;
  return start >= now - LOOKBACK_MS && start <= now + windowMs;
}

export async function upgradeUpcomingPlaceholderMeetings(input?: {
  limit?: number;
  windowMs?: number;
}): Promise<{ upgraded: number; failed: number }> {
  if (!isLiveZoomConfigured()) return { upgraded: 0, failed: 0 };

  const limit = Math.max(1, input?.limit ?? 8);
  const windowMs = input?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  let upgraded = 0;
  let failed = 0;

  const classes = readClassesDb();
  for (const liveClass of classes.classes) {
    if (upgraded + failed >= limit) break;
    if (liveClass.deletedAt || liveClass.status === "cancelled" || liveClass.status === "draft") {
      continue;
    }
    if (!inWindow(liveClass.startsAt, now, windowMs)) continue;
    const meeting = classes.zoomMeetings.find((item) => item.liveClassId === liveClass.id);
    if (meeting && !isPlaceholderZoomMeeting(meeting)) continue;
    try {
      const next = await ensureLiveMeetingForClass(liveClass.id);
      if (next && !isPlaceholderZoomMeeting(next)) upgraded += 1;
    } catch (error) {
      failed += 1;
      console.error("Upcoming class Zoom upgrade failed", liveClass.id, error);
    }
  }

  for (const booking of readBookingsDb().bookings) {
    if (upgraded + failed >= limit) break;
    if (booking.status !== "confirmed" && booking.status !== "pending") continue;
    if (!inWindow(booking.startsAt, now, windowMs)) continue;
    if (booking.zoom && !isPlaceholderZoomMeeting(booking.zoom)) continue;
    try {
      const next = await ensureBookingZoom(booking.id, booking.instructorId);
      if (next.zoom && !isPlaceholderZoomMeeting(next.zoom)) upgraded += 1;
    } catch (error) {
      failed += 1;
      console.error("Upcoming booking Zoom upgrade failed", booking.id, error);
    }
  }

  for (const session of readMockExamsDb().sessions) {
    if (upgraded + failed >= limit) break;
    if (!["confirmed", "in_progress"].includes(session.status)) continue;
    if (!inWindow(session.startsAt, now, windowMs)) continue;
    if (session.zoom && !isPlaceholderZoomMeeting(session.zoom)) continue;
    try {
      const next = await ensureLiveMockExamZoom(session.id);
      if (next?.zoom && !isPlaceholderZoomMeeting(next.zoom)) upgraded += 1;
    } catch (error) {
      failed += 1;
      console.error("Upcoming mock exam Zoom upgrade failed", session.id, error);
    }
  }

  return { upgraded, failed };
}
