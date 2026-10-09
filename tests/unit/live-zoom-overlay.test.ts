import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("live Zoom lesson overlay", () => {
  it("only obscures recorded playback when the tab is actually hidden", () => {
    const protection = src("features/learning/components/content-protection.tsx");
    expect(protection).toMatch(/document\.visibilityState === "hidden"/);
    expect(protection).not.toMatch(/window\.addEventListener\("blur"/);
    expect(protection).not.toMatch(/window\.addEventListener\("focus"/);
  });

  it("keeps live Zoom visible and offers the in-app join room", () => {
    const player = src("features/learning/components/course-player-view.tsx");
    expect(player).toMatch(/deterScreenRecording: liveCourse \? false/);
    expect(player).toMatch(/Join live Zoom/);
    expect(player).toMatch(/liveClassroom\.href/);
    expect(src("app/api/learning/courses/[courseId]/lessons/[lessonId]/route.ts")).toMatch(
      /getLiveClassroomForStudentCourse/,
    );
    expect(src("services/learning/learning-service.ts")).toMatch(/href: `\/join\/\$\{match\.id\}`/);
  });
});
