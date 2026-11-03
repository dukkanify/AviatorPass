export function kindLabel(kind: string): string {
  if (kind === "reassign") return "Reassign";
  if (kind === "schedule_session") return "Schedule session";
  return "Assign";
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
      const label = rest.join(":").trim() || sourceText;
      const key = sourceText.toLowerCase();
      if (key === "outside_availability") {
        return label || "Outside the instructor availability window";
      }
      if (key === "live_class") {
        return `Conflicts with live class: ${label}`;
      }
      if (key === "booking") {
        return `Conflicts with booking: ${label}`;
      }
      if (key === "availability_block") {
        return `Blocked time: ${label}`;
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
  // Titles often append "· 12:43 GST" — keep the human name only.
  return title.split("·")[0]?.trim() || title.trim();
}

export function formatEventWhen(startsAt: string, endsAt?: string | null): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return startsAt;
  const date = start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (!endsAt) return `${date} · ${time}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} · ${time}`;
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}–${endTime}`;
}

export function eventDayKey(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return startsAt;
  return start.toISOString().slice(0, 10);
}
