/**
 * Mock exam availability — working hours + conflict-aware slots (CR007).
 * Hours are wall-clock in settings.timezone (Asia/Kuwait for ELP).
 */

import { ROLES } from "@/constants/roles";
import { weekdayOfLocalDate, zonedWallTimeToUtc } from "@/lib/datetime/zoned";
import { readAuthDb } from "@/services/auth/store";
import { readBookingsDb } from "@/services/bookings/store";
import { rangesOverlap } from "@/services/classes/validation";
import { ensureMockExamsSeeded, readMockExamsDb } from "@/services/mock-exams/store";
import { MockExamError, quoteMockExam } from "@/services/mock-exams/pricing-service";
import type { MockExamSlot } from "@/types/mock-exams";

const ACTIVE = new Set(["pending_payment", "confirmed", "in_progress"]);

export function listMockExaminers() {
  ensureMockExamsSeeded();
  const settings = readMockExamsDb().settings;
  const instructors = readAuthDb().users.filter(
    (u) => u.role === ROLES.INSTRUCTOR && u.status === "active",
  );
  const pool = settings.examinerIds.length
    ? instructors.filter((u) => settings.examinerIds.includes(u.id))
    : instructors;
  return pool.map((u) => ({
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
    email: u.email,
  }));
}

export function getMockExamSlots(input: {
  date: string;
  examinerId: string;
  examTypeId: string;
  selectedExtraFeeIds?: string[];
}): MockExamSlot[] {
  ensureMockExamsSeeded();
  const settings = readMockExamsDb().settings;
  if (!settings.enabled) return [];

  const exam = readMockExamsDb().examTypes.find((t) => t.id === input.examTypeId && t.active);
  if (!exam) throw new MockExamError("Exam type not available", 404);

  if (!listMockExaminers().some((e) => e.id === input.examinerId)) {
    throw new MockExamError("Examiner not available", 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new MockExamError("date must be yyyy-MM-dd");
  }
  if (settings.blackoutDates.includes(input.date)) return [];

  const tz = settings.timezone || "Asia/Kuwait";
  const weekday = weekdayOfLocalDate(input.date, tz);
  const wh = settings.workingHours.find((w) => w.weekday === weekday && w.active);
  if (!wh) return [];

  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (input.date < todayYmd) return [];

  const max = new Date();
  max.setUTCDate(max.getUTCDate() + settings.maxAdvanceDays);
  const maxYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(max);
  if (input.date > maxYmd) return [];

  const duration = exam.durationMinutes;
  const step = settings.slotStepMinutes;
  const earliest = Date.now() + settings.minNoticeMinutes * 60_000;
  const sessions = readMockExamsDb().sessions.filter(
    (s) => s.examinerId === input.examinerId && ACTIVE.has(s.status),
  );

  let bookingBusy: Array<{ startsAt: string; endsAt: string }> = [];
  try {
    bookingBusy = readBookingsDb()
      .bookings.filter(
        (b) => b.instructorId === input.examinerId && ["pending", "confirmed"].includes(b.status),
      )
      .map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt }));
  } catch {
    bookingBusy = [];
  }

  const slots: MockExamSlot[] = [];
  const startMin = wh.startHour * 60;
  const endMin = wh.endHour * 60;
  for (let minute = startMin; minute + duration <= endMin; minute += step) {
    const hour = Math.floor(minute / 60);
    const min = minute % 60;
    const startsAt = zonedWallTimeToUtc(input.date, hour, min, tz);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const startsIso = startsAt.toISOString();
    const endsIso = endsAt.toISOString();

    if (startsAt.getTime() < earliest) {
      slots.push({ startsAt: startsIso, endsAt: endsIso, available: false, reason: "Too soon" });
      continue;
    }

    const busy =
      sessions.some((s) => rangesOverlap(s.startsAt, s.endsAt, startsIso, endsIso)) ||
      bookingBusy.some((b) => rangesOverlap(b.startsAt, b.endsAt, startsIso, endsIso));

    if (busy) {
      slots.push({ startsAt: startsIso, endsAt: endsIso, available: false, reason: "Booked" });
      continue;
    }

    const quote = quoteMockExam({
      examTypeId: input.examTypeId,
      startsAt: startsIso,
      selectedExtraFeeIds: input.selectedExtraFeeIds,
    });
    slots.push({ startsAt: startsIso, endsAt: endsIso, available: true, quote });
  }

  return slots;
}
