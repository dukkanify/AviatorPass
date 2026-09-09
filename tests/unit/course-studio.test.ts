import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatDurationHours, seoScore, slugifyCourse } from "@/features/courses/lib/course-studio";
import { publicCourseHref, publicCourseRef } from "@/lib/courses/public-course-path";

describe("course studio helpers", () => {
  it("slugifies course titles and codes", () => {
    expect(slugifyCourse("PPL Ground School Essentials")).toBe("ppl-ground-school-essentials");
    expect(slugifyCourse("PPL-GS-01")).toBe("ppl-gs-01");
  });

  it("converts 6000 minutes into 100 Hours", () => {
    expect(formatDurationHours(6000).label).toBe("100 Hours");
    expect(formatDurationHours(90).label).toBe("1h 30m");
    expect(formatDurationHours(45).label).toBe("45 minutes");
  });

  it("scores SEO fields", () => {
    const weak = seoScore(
      { metaTitle: "Hi", metaDescription: "Short", ogImageUrl: "", focusKeyword: "" },
      "Hi",
    );
    expect(weak.score).toBeLessThan(50);

    const strong = seoScore(
      {
        metaTitle: "PPL Ground School Essentials for new pilots",
        metaDescription:
          "A complete ground-school course covering air law, navigation, and meteorology for new private pilots.",
        ogImageUrl: "/uploads/cover.webp",
        focusKeyword: "PPL",
      },
      "PPL Ground School",
    );
    expect(strong.score).toBeGreaterThanOrEqual(80);
  });

  it("prefers metadata slug for public URLs", () => {
    expect(
      publicCourseRef({ id: "uuid", code: "PPL-GS-01", metadata: { slug: "ppl-gs-01" } }),
    ).toBe("ppl-gs-01");
    expect(
      publicCourseHref({ id: "uuid", code: "PPL-GS-01", metadata: { slug: "ppl-gs-01" } }),
    ).toBe("/courses/ppl-gs-01");
  });

  it("does not keep an Image URL field in course studio or form", () => {
    const roots = [
      "features/courses/components/course-studio/course-studio-view.tsx",
      "features/courses/components/course-form-dialog.tsx",
      "features/courses/components/course-management-view.tsx",
    ];
    for (const file of roots) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toContain("Image URL");
    }
  });

  it("includes Review in course statuses", async () => {
    const { COURSE_STATUS_LABELS, COURSE_STATUSES } = await import("@/constants/courses");
    expect(COURSE_STATUSES).toContain("review");
    expect(COURSE_STATUS_LABELS.review).toBe("Review");
  });
});
