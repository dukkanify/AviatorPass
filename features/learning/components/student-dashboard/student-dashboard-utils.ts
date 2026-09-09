import type { LearningCalendarItem, LearningHistoryEvent, StudyGoal } from "@/types/learning";

export const AVIATION_THUMBS = [
  "https://images.unsplash.com/photo-1436491865331-4ffd7ba14f70?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1464037866556-6812c9d1c72f?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=900&q=70",
  "/images/hero-aviation.svg",
] as const;

export const HERO_IMAGE =
  "https://images.unsplash.com/photo-1464037866556-6812c9d1c72f?auto=format&fit=crop&w=2000&q=80";

const MOTIVATION_QUOTES = [
  "A good pilot is always a student.",
  "Discipline in the briefing room becomes confidence in the cockpit.",
  "Fly the aircraft first. Then fly the procedure.",
  "Preparation is the cheapest insurance in aviation.",
  "Stay ahead of the aircraft — and ahead of tomorrow’s lesson.",
  "Every hour studied today is a safer sector tomorrow.",
] as const;

const WEATHER_BY_COUNTRY: Record<
  string,
  { city: string; country: string; tempC: number; sky: string; windKt: number; icon: string }
> = {
  KW: {
    city: "Kuwait City",
    country: "Kuwait",
    tempC: 34,
    sky: "Clear Sky",
    windKt: 8,
    icon: "☀️",
  },
  AE: { city: "Dubai", country: "UAE", tempC: 32, sky: "Clear Sky", windKt: 10, icon: "☀️" },
  SA: { city: "Riyadh", country: "Saudi Arabia", tempC: 38, sky: "Sunny", windKt: 12, icon: "☀️" },
  US: { city: "Fair weather", country: "USA", tempC: 22, sky: "Few clouds", windKt: 6, icon: "⛅" },
  GB: { city: "London", country: "UK", tempC: 16, sky: "Overcast", windKt: 14, icon: "☁️" },
};

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

export function formatHeroClock(now: Date): string {
  return now.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
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
  label: string;
} {
  const code = (countryCode ?? "KW").toUpperCase();
  const row = WEATHER_BY_COUNTRY[code] ?? WEATHER_BY_COUNTRY.KW!;
  return {
    ...row,
    label: `${row.city}, ${row.country} · ${row.tempC}°C · ${row.sky} · ${row.windKt} kt`,
  };
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
