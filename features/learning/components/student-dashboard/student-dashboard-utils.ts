import type { LearningCalendarItem, LearningHistoryEvent, StudyGoal } from "@/types/learning";

export const AVIATION_THUMBS = [
  "/images/student-hero.jpg",
  "/images/student-promo.jpg",
  "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=900&q=70",
  "/images/hero-aviation.svg",
] as const;

export const HERO_IMAGE = "/images/student-hero.jpg";

const MOTIVATION_QUOTES = [
  "A good pilot is always a student.",
  "Discipline in the briefing room becomes confidence in the cockpit.",
  "Fly the aircraft first. Then fly the procedure.",
  "Preparation is the cheapest insurance in aviation.",
  "Stay ahead of the aircraft — and ahead of tomorrow’s lesson.",
  "Every hour studied today is a safer sector tomorrow.",
] as const;

type HeroLocation = {
  city: string;
  country: string;
  tempC: number;
  sky: string;
  windKt: number;
  icon: string;
  /** IANA zone for the displayed city — hero clock follows this, never the browser. */
  timeZone: string;
};

const WEATHER_BY_COUNTRY: Record<string, HeroLocation> = {
  KW: {
    city: "Kuwait City",
    country: "Kuwait",
    tempC: 34,
    sky: "Clear Sky",
    windKt: 8,
    icon: "☀️",
    timeZone: "Asia/Kuwait",
  },
  AE: {
    city: "Dubai",
    country: "UAE",
    tempC: 32,
    sky: "Clear Sky",
    windKt: 10,
    icon: "☀️",
    timeZone: "Asia/Dubai",
  },
  SA: {
    city: "Riyadh",
    country: "Saudi Arabia",
    tempC: 38,
    sky: "Sunny",
    windKt: 12,
    icon: "☀️",
    timeZone: "Asia/Riyadh",
  },
  QA: {
    city: "Doha",
    country: "Qatar",
    tempC: 36,
    sky: "Clear Sky",
    windKt: 9,
    icon: "☀️",
    timeZone: "Asia/Qatar",
  },
  BH: {
    city: "Manama",
    country: "Bahrain",
    tempC: 35,
    sky: "Clear Sky",
    windKt: 8,
    icon: "☀️",
    timeZone: "Asia/Bahrain",
  },
  OM: {
    city: "Muscat",
    country: "Oman",
    tempC: 33,
    sky: "Sunny",
    windKt: 7,
    icon: "☀️",
    timeZone: "Asia/Muscat",
  },
  EG: {
    city: "Cairo",
    country: "Egypt",
    tempC: 28,
    sky: "Clear Sky",
    windKt: 10,
    icon: "☀️",
    timeZone: "Africa/Cairo",
  },
  JO: {
    city: "Amman",
    country: "Jordan",
    tempC: 26,
    sky: "Clear Sky",
    windKt: 8,
    icon: "☀️",
    timeZone: "Asia/Amman",
  },
  LB: {
    city: "Beirut",
    country: "Lebanon",
    tempC: 24,
    sky: "Partly cloudy",
    windKt: 7,
    icon: "⛅",
    timeZone: "Asia/Beirut",
  },
  IQ: {
    city: "Baghdad",
    country: "Iraq",
    tempC: 36,
    sky: "Sunny",
    windKt: 9,
    icon: "☀️",
    timeZone: "Asia/Baghdad",
  },
  TR: {
    city: "Istanbul",
    country: "Turkey",
    tempC: 22,
    sky: "Partly cloudy",
    windKt: 8,
    icon: "⛅",
    timeZone: "Europe/Istanbul",
  },
  IN: {
    city: "Mumbai",
    country: "India",
    tempC: 30,
    sky: "Haze",
    windKt: 6,
    icon: "⛅",
    timeZone: "Asia/Kolkata",
  },
  PK: {
    city: "Karachi",
    country: "Pakistan",
    tempC: 31,
    sky: "Clear Sky",
    windKt: 7,
    icon: "☀️",
    timeZone: "Asia/Karachi",
  },
  GB: {
    city: "London",
    country: "UK",
    tempC: 16,
    sky: "Overcast",
    windKt: 14,
    icon: "☁️",
    timeZone: "Europe/London",
  },
  US: {
    city: "New York",
    country: "USA",
    tempC: 22,
    sky: "Few clouds",
    windKt: 6,
    icon: "⛅",
    timeZone: "America/New_York",
  },
  CA: {
    city: "Toronto",
    country: "Canada",
    tempC: 18,
    sky: "Partly cloudy",
    windKt: 8,
    icon: "⛅",
    timeZone: "America/Toronto",
  },
  AU: {
    city: "Sydney",
    country: "Australia",
    tempC: 24,
    sky: "Clear Sky",
    windKt: 10,
    icon: "☀️",
    timeZone: "Australia/Sydney",
  },
  DE: {
    city: "Berlin",
    country: "Germany",
    tempC: 17,
    sky: "Cloudy",
    windKt: 9,
    icon: "☁️",
    timeZone: "Europe/Berlin",
  },
  FR: {
    city: "Paris",
    country: "France",
    tempC: 18,
    sky: "Partly cloudy",
    windKt: 7,
    icon: "⛅",
    timeZone: "Europe/Paris",
  },
  DK: {
    city: "Copenhagen",
    country: "Denmark",
    tempC: 14,
    sky: "Overcast",
    windKt: 12,
    icon: "☁️",
    timeZone: "Europe/Copenhagen",
  },
};

/** Default when country is unknown — AviatorPass primary market. */
export const HERO_DEFAULT_TIME_ZONE = "Asia/Kuwait";

/** True only for real IANA zones (rejects garbage like `"USA "`). */
export function isValidIanaTimeZone(value: string | null | undefined): boolean {
  const zone = value?.trim() ?? "";
  if (!zone || !zone.includes("/")) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function timeZoneForCountry(countryCode?: string | null): string {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (code && WEATHER_BY_COUNTRY[code]) return WEATHER_BY_COUNTRY[code]!.timeZone;
  return HERO_DEFAULT_TIME_ZONE;
}

/**
 * Hero location + clock zone from the student's country.
 * Never falls EG→Kuwait. Never uses invalid profile timezones like `"USA "`.
 */
export function resolveHeroLocation(input: {
  countryCode?: string | null;
  profileTimeZone?: string | null;
}): HeroLocation & { label: string } {
  const code = (input.countryCode ?? "").trim().toUpperCase() || "KW";
  const row = WEATHER_BY_COUNTRY[code] ?? WEATHER_BY_COUNTRY.KW!;
  // Clock always follows the city we display (location), not browser / junk profile TZ.
  const timeZone = row.timeZone;
  void input.profileTimeZone; // reserved — location wins over profile TZ by product rule
  return {
    ...row,
    timeZone,
    label: `${row.city}, ${row.country} · ${row.tempC}°C · ${row.sky} · ${row.windKt} kt`,
  };
}

export type PilotLevel = {
  name: string;
  next: string | null;
  xp: number;
  nextXp: number;
  percent: number;
};

export type LessonStep = {
  id: string;
  title: string;
  state: "completed" | "current" | "locked";
  index: number;
};

export type HeatmapCell = {
  key: string;
  date: string;
  count: number;
};

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function firstNameOf(fullName?: string | null, fallback = "Aviator"): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}

export function initialsOf(fullName?: string | null, email?: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email?.[0] ?? "S").toUpperCase();
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "0h";
  return `${Number(hours.toFixed(hours >= 10 ? 0 : 1))}h`;
}

export function formatHoursMinutes(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatInZone(now: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const zone = timeZone.trim() || HERO_DEFAULT_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: zone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: HERO_DEFAULT_TIME_ZONE,
    }).format(now);
  }
}

/** Wall-clock for the hero overlay — always in the location's timezone. */
export function formatHeroClock(now: Date, timeZone = HERO_DEFAULT_TIME_ZONE): string {
  return formatInZone(now, timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Local hour (0–23) in the hero location timezone — for Good Morning/Afternoon. */
export function hourInTimeZone(now: Date, timeZone = HERO_DEFAULT_TIME_ZONE): number {
  const zone = timeZone.trim() || HERO_DEFAULT_TIME_ZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isFinite(hour) ? hour : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatRemainingLessons(completed: number, total: number): string {
  const remaining = Math.max(0, total - completed);
  return `${remaining} remaining`;
}

export function courseThumb(index: number, cover?: string | null, thumb?: string | null): string {
  return cover || thumb || AVIATION_THUMBS[index % AVIATION_THUMBS.length]!;
}

export function weekDays(anchor = new Date()): Array<{
  key: string;
  label: string;
  date: number;
  iso: string;
  isToday: boolean;
}> {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const weekday = start.getDay();
  start.setDate(start.getDate() - weekday);
  const todayKey = new Date(anchor).toDateString();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      key: day.toISOString(),
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      date: day.getDate(),
      iso: day.toISOString(),
      isToday: day.toDateString() === todayKey,
    };
  });
}

export function sameDay(a: string | number | Date, b: string | number | Date): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function isLiveWindow(
  startsAt: string | number | Date,
  now = Date.now(),
  durationMs = 60 * 60 * 1000,
): boolean {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return false;
  const joinEarlyMs = 15 * 60 * 1000;
  return now >= start - joinEarlyMs && now <= start + durationMs;
}

export function formatDashboardEventTime(
  startsAt: string | number | Date,
  now = Date.now(),
): string {
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return "";
  const time = when.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay(when, now)) return time;
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date} · ${time}`;
}

export function calendarKindLabel(type: LearningCalendarItem["type"]): string {
  switch (type) {
    case "live_class":
      return "Live session";
    case "study_session":
      return "Self study";
    case "deadline":
      return "Homework";
    case "lesson":
      return "Today's lesson";
    default:
      return "Study";
  }
}

export function activityKindLabel(type: LearningHistoryEvent["type"] | string): string {
  switch (type) {
    case "lesson_completed":
      return "Completed lesson";
    case "goal_completed":
      return "Certificate earned";
    case "study_session":
      return "Study session";
    case "resource_downloaded":
      return "Materials downloaded";
    case "payment_approved":
      return "Payment approved";
    case "assignment_submitted":
      return "Assignment submitted";
    case "exam_passed":
      return "Exam passed";
    default:
      return String(type).replace(/_/g, " ");
  }
}

export function goalHours(
  goals: StudyGoal[],
  period: StudyGoal["period"],
): {
  completed: number;
  target: number;
  percent: number;
} {
  const goal = goals.find((item) => item.period === period && item.status === "active");
  if (!goal || goal.targetHours <= 0) {
    return { completed: 0, target: 0, percent: 0 };
  }
  return {
    completed: goal.completedHours,
    target: goal.targetHours,
    percent: clampPercent((goal.completedHours / goal.targetHours) * 100),
  };
}

export function countdownLabel(startsAt: string | null, now = Date.now()): string {
  if (!startsAt) return "Schedule pending";
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return "Schedule pending";
  const diff = start - now;
  if (diff <= 0) return "Starting now";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `${hours}h ${rest}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function estimatedCompletion(progressPercent: number): string {
  const remaining = Math.max(0, 100 - clampPercent(progressPercent));
  if (remaining === 0) return "Course complete";
  if (remaining > 80) return "About 12 weeks remaining";
  if (remaining > 40) return "About 6 weeks remaining";
  return "About 3 weeks remaining";
}

export function daysRemaining(progressPercent: number): number {
  const remaining = Math.max(0, 100 - clampPercent(progressPercent));
  if (remaining === 0) return 0;
  if (remaining > 80) return 84;
  if (remaining > 40) return 42;
  return 21;
}

export function ringOffset(percent: number, radius = 54): number {
  const circumference = 2 * Math.PI * radius;
  return circumference - (clampPercent(percent) / 100) * circumference;
}

export function dailyMotivationQuote(now = new Date()): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return MOTIVATION_QUOTES[day % MOTIVATION_QUOTES.length]!;
}

export function weatherForCountry(countryCode?: string | null): {
  city: string;
  country: string;
  tempC: number;
  sky: string;
  windKt: number;
  icon: string;
  timeZone: string;
  label: string;
} {
  return resolveHeroLocation({ countryCode });
}

export function computeXp(input: {
  completedLessons: number;
  learningHours: number;
  certificates: number;
  progressPercent: number;
}): number {
  return (
    input.completedLessons * 25 +
    Math.round(input.learningHours * 10) +
    input.certificates * 120 +
    clampPercent(input.progressPercent) * 4
  );
}

export function pilotLevelFromXp(xp: number): PilotLevel {
  const bands = [
    { name: "Cadet", next: "First Officer", nextXp: 400 },
    { name: "First Officer", next: "Senior FO", nextXp: 900 },
    { name: "Senior FO", next: "Captain", nextXp: 1600 },
    { name: "Captain", next: null, nextXp: 1600 },
  ] as const;
  const band = bands.find((item) => xp < item.nextXp) ?? bands[bands.length - 1]!;
  const prevXp =
    band.name === "Cadet"
      ? 0
      : band.name === "First Officer"
        ? 400
        : band.name === "Senior FO"
          ? 900
          : 1600;
  const span = Math.max(1, band.nextXp - prevXp);
  return {
    name: band.name,
    next: band.next,
    xp,
    nextXp: band.nextXp,
    percent: clampPercent(((xp - prevXp) / span) * 100),
  };
}

export function academicGpa(progressPercent: number, completedLessons: number): number {
  const base = 3.1 + (clampPercent(progressPercent) / 100) * 0.7;
  const bonus = Math.min(0.2, completedLessons * 0.01);
  return Number(Math.min(4, base + bonus).toFixed(2));
}

export function lessonTimeline(
  completed: number,
  total: number,
  currentTitle: string,
): LessonStep[] {
  const count = Math.min(Math.max(total || 6, 4), 8);
  return Array.from({ length: count }, (_, index) => {
    const state: LessonStep["state"] =
      index < completed ? "completed" : index === completed ? "current" : "locked";
    return {
      id: `lesson-step-${index + 1}`,
      title: state === "current" ? currentTitle || `Lesson ${index + 1}` : `Lesson ${index + 1}`,
      state,
      index: index + 1,
    };
  });
}

export function heatmapFromDates(dates: Array<string | number | Date>, weeks = 12): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const value of dates) {
    const key = new Date(value).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (weeks * 7 - 1));
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = day.toDateString();
    return { key, date: day.toISOString(), count: counts.get(key) ?? 0 };
  });
}

export function nextFlightMilestone(progressPercent: number): string {
  const percent = clampPercent(progressPercent);
  if (percent >= 100) return "ATPL theory complete — book your skills test briefing";
  if (percent >= 75) return "Final revision block and mock exams";
  if (percent >= 40) return "Performance & Navigation deep-dive";
  return "Complete Principles of Flight fundamentals";
}

export function learningStreak(dates: Array<string | number | Date>, now = new Date()): number {
  const days = new Set(dates.map((value) => new Date(value).toDateString()));
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
