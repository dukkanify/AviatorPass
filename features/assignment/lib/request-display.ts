export function kindLabel(kind: string): string {
  if (kind === "reassign") return "Reassign";
  if (kind === "schedule_session") return "Schedule session";
  return "Assign";
}

/** Drop raw ids / placeholder titles so operators see a readable name. */
export function cleanConflictLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "another session";
  if (/^blocking class\b/i.test(trimmed) || /^class[_\s-]?\d+$/i.test(trimmed)) {
    return "another live class";
  }
  if (/^\d{10,}$/.test(trimmed)) return "another session";
  return cleanEventTitle(trimmed);
}

export function humanConflictLines(summary: string | null | undefined): string[] {
  if (!summary?.trim()) return [];
  return summary
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [source, ...rest] = part.split(":");
      const sourceText = (source ?? "").trim();
      const label = cleanConflictLabel(rest.join(":").trim() || sourceText);
      const key = sourceText.toLowerCase();
      if (key === "outside_availability") {
        return "Preferred time is outside this instructor's available hours — pick another time or instructor.";
      }
      if (key === "live_class") {
        return `Overlaps live class "${label}" — choose a free slot on the calendar.`;
      }
      if (key === "booking") {
        return `Overlaps booking "${label}" — choose a free slot on the calendar.`;
      }
      if (key === "availability_block") {
        return `Instructor is blocked ("${label}") — pick another time.`;
      }
      return label;
    });
}

export function requestPriority(status: string, hasConflict: boolean): number {
  const value = status.toLowerCase();
  if (value.includes("unable") || hasConflict) return 0;
  if (value.includes("scheduling_required")) return 1;
  if (value.includes("queued")) return 2;
  if (value.includes("scheduled")) return 3;
  return 4;
}

export function eventTypeLabel(type: string): string {
  const value = type.toLowerCase();
  if (value === "live_class") return "Live class";
  if (value === "booking") return "Booking";
  if (value === "availability") return "Availability";
  if (value === "block") return "Blocked";
  if (value === "queue") return "Queue hold";
  return type.replaceAll("_", " ");
}

export function cleanEventTitle(title: string): string {
  // Drop trailing clock stamps like "· 12:43 GST", keep subject suffixes.
  return title.replace(/\s*·\s*\d{1,2}:\d{2}(?:\s*[A-Z]{2,5})?\s*$/u, "").trim() || title.trim();
}

export function formatEventWhen(startsAt: string, endsAt?: string | null): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return startsAt;
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!endsAt) return `${date} · ${time}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} · ${time}`;
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}–${endTime}`;
}

export function eventDayKey(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return startsAt;
  return start.toISOString().slice(0, 10);
}
