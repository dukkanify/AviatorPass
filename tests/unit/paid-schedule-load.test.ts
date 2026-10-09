import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_ATPL_PACKAGE_SCHEDULE } from "@/constants/atpl-complete-package";
import {
  getPaidStudentScheduleOverview,
  sessionFromAtplPackageSchedule,
} from "@/services/schedule/dynamic-schedule-service";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("paid student schedule load", () => {
  it("does not open the classes blob on student schedule GET", () => {
    const route = src("app/api/schedule/route.ts");
    const get = route.slice(
      route.indexOf("export async function GET"),
      route.indexOf("export async function POST"),
    );
    expect(get).toContain("getPaidStudentScheduleOverview");
    expect(get.indexOf("getPaidStudentScheduleOverview")).toBeLessThan(
      get.indexOf("getScheduleOverview("),
    );
    expect(get).toContain("if (user.role === ROLES.STUDENT)");
  });

  it("builds the next session from a confirmed ATPL first lecture", () => {
    const snapshot = {
      ...EMPTY_ATPL_PACKAGE_SCHEDULE,
      orderId: "order-paid",
      packageOwned: true,
      scheduleProvisional: false,
      confirmedFirstLectureAt: "2026-10-18T18:00:00.000Z",
      confirmedFirstLectureLabel: "Sun, 18 Oct 2026, 18:00",
      firstLectureLiveClassId: "class-first",
      firstLectureOnTimetable: true,
      firstLectureSubjectCode: "022",
      firstLectureSubjectTitle: "Instrumentation",
      assignedInstructorName: "TK 2",
    };
    const session = sessionFromAtplPackageSchedule(snapshot);
    expect(session?.id).toBe("class-first");
    expect(session?.title).toBe("Instrumentation");
    expect(session?.source).toBe("atpl");
    expect(session?.computedStatus).toBe("upcoming");

    const overview = getPaidStudentScheduleOverview(snapshot);
    expect(overview.nextSession.session?.title).toBe("Instrumentation");
    expect(overview.upcoming).toHaveLength(1);
    expect(overview.timeline[0]?.title).toBe("Instrumentation");
    expect(overview.stats.upcoming).toBe(1);
  });

  it("returns an empty overview when the first lecture is still provisional", () => {
    const overview = getPaidStudentScheduleOverview({
      ...EMPTY_ATPL_PACKAGE_SCHEDULE,
      orderId: "order-paid",
      packageOwned: true,
      scheduleProvisional: true,
      requestedFirstLectureLabel: "Sun, 18 Oct 2026, 18:00",
    });
    expect(overview.nextSession.session).toBeNull();
    expect(overview.upcoming).toEqual([]);
    expect(overview.timeline).toEqual([]);
  });
});
