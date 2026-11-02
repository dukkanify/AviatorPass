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
      "Outside instructor availability window",
      "Conflicts with live class: ATPL lecture · Instrumentation",
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
    expect(formatEventWhen("2026-10-30T16:41:48.000Z")).toMatch(/Oct/);
  });
});
