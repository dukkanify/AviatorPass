/**
 * Timezone helpers for ELP mock exam hours (Asia/Kuwait wall clock).
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function partsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekdayShort: map.weekday ?? "",
  };
}

const WEEKDAY_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weekdayInZone(date: Date, timeZone: string): number {
  const short = partsInZone(date, timeZone).weekdayShort;
  return WEEKDAY_TO_JS[short] ?? date.getUTCDay();
}

export function weekdayOfLocalDate(ymd: string, timeZone: string): number {
  const utcNoonGuess = new Date(`${ymd}T12:00:00.000Z`);
  return weekdayInZone(utcNoonGuess, timeZone);
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = new Date(`${ymd}T${pad(hour)}:${pad(minute)}:00.000Z`);
  for (let i = 0; i < 6; i += 1) {
    const shown = partsInZone(utc, timeZone);
    const shownStamp = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    const wantStamp = Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(5, 7)) - 1,
      Number(ymd.slice(8, 10)),
      hour,
      minute,
    );
    const diffMin = (shownStamp - wantStamp) / 60_000;
    if (diffMin === 0) return utc;
    utc = new Date(utc.getTime() - diffMin * 60_000);
  }
  return utc;
}

/** Calendar date `YYYY-MM-DD` in `timeZone` (for date pickers). */
export function todayInZone(timeZone: string, now = new Date()): string {
  const p = partsInZone(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatZonedMeetingDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/ /g, "-");
}

export function formatZonedDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatMockExamMeetingTopic(input: {
  lastName: string;
  startsAt: string;
  timeZone: string;
}): string {
  const family = input.lastName.trim() || "Student";
  const date = formatZonedMeetingDate(new Date(input.startsAt), input.timeZone);
  return `Mock Exam / ${family} / ${date}`;
}
