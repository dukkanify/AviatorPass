import { describe, expect, it } from "vitest";

import {
  cleanEventTitle,
  eventTypeLabel,
  formatEventWhen,
  humanConflictLines,
  kindLabel,
  requestPriority,
} from "@/features/assignment/lib/request-display";

describe("assignment request display", () => {
  it("humanizes technical conflict summaries for management", () => {
    expect(
      humanConflictLines(
        "outside_availability: Outside instructor availability window; live_class: ATPL lecture · Instrumentation",
      ),
    ).toEqual([
      "Preferred time is outside this instructor's available hours, pick another time or instructor.",
      'Overlaps live class "ATPL lecture · Instrumentation", choose a free slot on the calendar.',
    ]);
  });

  it("hides raw blocking-class ids in conflict labels", () => {
    expect(humanConflictLines("live_class: Blocking class 1793637043043")).toEqual([
      'Overlaps live class "another live class", choose a free slot on the calendar.',
    ]);
  });

  it("labels kinds and prioritizes blocked requests first", () => {
    expect(kindLabel("reassign")).toBe("Reassign");
    expect(requestPriority("queued", false)).toBeGreaterThan(
      requestPriority("scheduling_required", true),
    );
  });

  it("formats calendar events for management scanning", () => {
    expect(eventTypeLabel("live_class")).toBe("Live class");
    expect(cleanEventTitle("Zoom Classroom UAT · 12:43 GST")).toBe("Zoom Classroom UAT");
    expect(formatEventWhen("2026-10-30T16:41:48.000Z")).toMatch(/\d{2}\/\d{2}\/2026/);
  });
});
