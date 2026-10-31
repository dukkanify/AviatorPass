import { describe, expect, it } from "vitest";

import {
  resolveLiveClassSubjectName,
  subjectNameFromLiveClassTitle,
} from "@/lib/classes/subject-display";
import { ATPL_PACKAGE_LECTURE_TITLE } from "@/constants/atpl-complete-package";

describe("live class subject display", () => {
  it("strips the ATPL lecture prefix from titles", () => {
    expect(subjectNameFromLiveClassTitle(`${ATPL_PACKAGE_LECTURE_TITLE} · Meteorology`, null)).toBe(
      "Meteorology",
    );
  });

  it("resolves official ATPL subject from courseId when present", () => {
    const name = resolveLiveClassSubjectName({
      title: "Live Demo Now",
      courseId: "course-atpl-022",
    });
    expect(name.length).toBeGreaterThan(2);
    expect(name).not.toBe("Live Demo Now");
    expect(name).not.toBe("your subject");
  });
});
