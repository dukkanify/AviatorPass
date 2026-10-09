import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import {
  displayLessonHeading,
  displayModuleHeading,
  isGenericLessonTitle,
  officialCourseDisplayTitle,
} from "@/lib/courses/display-title";
import { readCoursesDb } from "@/services/courses/store";
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
    for (const subject of ATPL_COMPLETE_PACKAGE_SUBJECTS) {
      const row = getCourseById(`ATPL-${subject.code}`);
      expect(row?.title, subject.code).toBe(subject.title);
    }
    const listed = listCourses({ pageSize: 200, status: "published" }).data;
    for (const subject of ATPL_COMPLETE_PACKAGE_SUBJECTS) {
      const row = listed.find((course) => course.code === `ATPL-${subject.code}`);
      expect(row?.title, subject.code).toBe(subject.title);
    }
    expect(listAtplCourses().map((course) => course.title)).not.toContain("ATPL 010 — Air Law");
    expect(listAtplCourses().find((course) => course.code === "ATPL-022")?.title).toBe(
      "Instrumentation",
    );

    const instrumentation = getCourseById("ATPL-022");
    const storedLessons = readCoursesDb().lessons.filter(
      (lesson) => lesson.courseId === instrumentation?.id,
    );
    expect(storedLessons.length).toBeGreaterThan(0);
    expect(storedLessons.some((lesson) => isGenericLessonTitle(lesson.title))).toBe(false);
    expect(storedLessons.some((lesson) => lesson.title === "Instrumentation")).toBe(true);
  });

  it("shows the course name instead of Lesson 1.1 on the student player", () => {
    expect(isGenericLessonTitle("Lesson 1.1")).toBe(true);
    expect(isGenericLessonTitle("ICAO annexes & international agreements")).toBe(false);
    expect(displayLessonHeading("Lesson 1.1", { code: "ATPL-022", title: "Instrumentation" })).toBe(
      "Instrumentation",
    );
    expect(
      displayLessonHeading("Pitot-static instruments", {
        code: "ATPL-022",
        title: "Instrumentation",
      }),
    ).toBe("Pitot-static instruments");
    expect(displayModuleHeading("Module 1")).toBe("First lecture");
    expect(displayModuleHeading("Regulatory foundations")).toBe("Regulatory foundations");

    const player = readFileSync(
      resolve(process.cwd(), "features/learning/components/course-player-view.tsx"),
      "utf8",
    );
    expect(player).toContain("officialCourseDisplayTitle(data.course)");
    expect(player).not.toContain("{data.lesson.title}");
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
