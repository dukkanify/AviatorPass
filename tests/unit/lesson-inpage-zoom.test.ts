import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  IN_APP_ZOOM_MEETING_SETTINGS,
  isZoomRegistrationJoinUrl,
} from "@/services/classes/zoom-service";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("lesson live class stays on the same page", () => {
  it("opens the classroom overlay instead of leaving the lesson", () => {
    const player = src("features/learning/components/course-player-view.tsx");
    expect(player).toContain("InAppZoomRoom");
    expect(player).toContain("/api/classes/${live.id}/join");
    expect(player).toContain("onLeave={() => setClassroom(null)}");
    expect(player).not.toMatch(/href=\{liveClassroom\.href\}/);
    expect(player).toMatch(/Open live classroom/);
  });

  it("turns off Zoom registration on an existing meeting before students join", () => {
    expect(IN_APP_ZOOM_MEETING_SETTINGS.approval_type).toBe(2);
    expect(IN_APP_ZOOM_MEETING_SETTINGS.join_before_host).toBe(true);
    expect(IN_APP_ZOOM_MEETING_SETTINGS.meeting_authentication).toBe(false);
    expect(isZoomRegistrationJoinUrl("https://zoom.us/meeting/register/abc")).toBe(true);
    expect(isZoomRegistrationJoinUrl("https://us02web.zoom.us/j/86524929538")).toBe(false);
    expect(src("services/classes/zoom-service.ts")).toMatch(
      /ensureLiveMeetingForClass[\s\S]*ensureInAppJoinSettings\(existing\)/,
    );
    expect(src("features/zoom/components/in-app-zoom-room.tsx")).toMatch(/3099\|registration/);
    expect(src("services/classes/class-service.ts")).toMatch(/enrolledInCourse/);
  });
});
