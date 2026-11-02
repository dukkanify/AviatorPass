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
      const label = rest.join(":").trim() || source.trim();
      const key = (source ?? "").trim().toLowerCase();
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
