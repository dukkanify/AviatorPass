import type { LearningCalendarItem, LearningHistoryEvent, StudyGoal } from "@/types/learning";

export const AVIATION_THUMBS = [
  "https://images.unsplash.com/photo-1436491865331-4ffd7ba14f70?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1464037866556-6812c9d1c72f?auto=format&fit=crop&w=900&q=70",
  "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=900&q=70",
  "/images/hero-aviation.svg",
] as const;

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

export function activityKindLabel(type: LearningHistoryEvent["type"]): string {
  switch (type) {
    case "lesson_completed":
      return "Lesson completed";
    case "goal_completed":
      return "Certificate earned";
    case "study_session":
      return "Study session";
    case "resource_downloaded":
      return "Materials downloaded";
    default:
      return type.replace(/_/g, " ");
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

export function ringOffset(percent: number, radius = 54): number {
  const circumference = 2 * Math.PI * radius;
  return circumference - (clampPercent(percent) / 100) * circumference;
}
