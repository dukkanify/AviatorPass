import { describe, expect, it } from "vitest";

import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import { officialCourseDisplayTitle } from "@/lib/courses/display-title";
import { getCourseById, listCourses } from "@/services/courses/course-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listAtplCourses } from "@/services/cgi/journey-service";
import { listPublicAtplSubjects } from "@/services/marketing/atpl-subjects-service";
import { resetAtplMarketingDbForTests } from "@/services/marketing/atpl-subjects-store";

describe("official ATPL titles in the LMS", () => {
  it("renames stored ATPL 010-style labels to the client subject names", () => {
    expect(
      officialCourseDisplayTitle({
        code: "ATPL-010",
        title: "ATPL 010 — Air Law",
      }),
    ).toBe("Air Law");
    expect(
      officialCourseDisplayTitle({
        code: "ATPL-021",
        title: "ATPL 021 — Aircraft General Knowledge",
      }),
    ).toBe("Aircraft General Knowledge");
    expect(
      officialCourseDisplayTitle({
        code: "PPL-GS-01",
        title: "PPL Ground School Essentials",
      }),
    ).toBe("PPL Ground School Essentials");
  });

  it("serves official titles from course list, course get, and CGI ATPL list", () => {
    ensureCoursesSeeded();
    const airLaw = getCourseById("ATPL-010");
    expect(airLaw?.title).toBe("Air Law");
    expect(airLaw?.title).not.toMatch(/^ATPL \d{3}/);
    const listed = listCourses({ pageSize: 80, status: "published" }).data;
    for (const subject of ATPL_COMPLETE_PACKAGE_SUBJECTS) {
      const row = listed.find((course) => course.code === `ATPL-${subject.code}`);
      expect(row?.title).toBe(subject.title);
    }
    expect(listAtplCourses().map((course) => course.title)).not.toContain("ATPL 010 — Air Law");
    expect(listAtplCourses().find((course) => course.code === "ATPL-022")?.title).toBe(
      "Instrumentation",
    );
  });

  it("keeps CMS extras off the public subject list", () => {
    resetAtplMarketingDbForTests();
    const publicRows = listPublicAtplSubjects();
    expect(publicRows).toHaveLength(13);
    expect(publicRows.map((row) => row.code)).toEqual(
      expect.arrayContaining(ATPL_COMPLETE_PACKAGE_SUBJECTS.map((subject) => subject.code)),
    );
    expect(publicRows.some((row) => row.code === "034" || row.code === "082")).toBe(false);
  });
});
