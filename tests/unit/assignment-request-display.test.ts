import { describe, expect, it } from "vitest";

import {
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
});
