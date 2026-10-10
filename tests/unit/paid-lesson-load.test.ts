import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getStoredCourseDetail,
  replaceAllCourseDetails,
  resetCourseDetailStoreRuntime,
  upsertCourseDetail,
} from "@/lib/data/lms-course-detail-store";
import { getCourseById, getCourseDetail } from "@/services/courses/course-service";
import { firstLectureMatchesCourse } from "@/services/learning/learning-service";
import type { CourseDetail } from "@/types/courses";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function sampleDetail(): CourseDetail {
  const ts = "2026-10-09T00:00:00.000Z";
  return {
    id: "course-atpl-022",
    title: "Lesson 1.1",
    shortDescription: "Flight instruments",
    fullDescription: "Flight instruments",
    code: "ATPL-022",
    categoryId: null,
    thumbnailUrl: null,
    coverImageUrl: null,
    previewVideoUrl: null,
    difficulty: "advanced",
    language: "en",
    estimatedDurationMinutes: 90,
    enrollmentMode: "invitation",
    deliveryType: "live",
    enrollmentOpen: true,
    hidden: false,
    featured: false,
    displayOrder: 0,
    status: "published",
    scheduledPublishAt: null,
    primaryInstructorId: null,
    priceAmount: null,
    currency: null,
    tags: [],
    metadata: {},
    createdById: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    publishedAt: ts,
    archivedAt: null,
    categoryName: null,
    primaryInstructorName: null,
    counts: {
      modules: 1,
      lessons: 1,
      resources: 0,
      enrollments: 1,
      activeEnrollments: 1,
    },
    modules: [
      {
        id: "mod-022",
        courseId: "course-atpl-022",
        title: "First lecture",
        description: "",
        order: 1,
        estimatedDurationMinutes: 90,
        status: "published",
        visible: true,
        createdAt: ts,
        updatedAt: ts,
        lessons: [
          {
            id: "c272ff046b70564504ae59b5b31afadf",
            courseId: "course-atpl-022",
            moduleId: "mod-022",
            title: "Instrumentation",
            description: "Opening briefing",
            contentHtml: "<p>First lecture for Instrumentation.</p>",
            videoUrl: null,
            durationMinutes: 90,
            estimatedStudyMinutes: 90,
            order: 1,
            previewAvailable: false,
            status: "published",
            createdAt: ts,
            updatedAt: ts,
            resources: [],
          },
        ],
      },
    ],
    instructors: [],
  };
}

describe("paid student lesson load", () => {
  afterEach(() => {
    replaceAllCourseDetails([]);
    resetCourseDetailStoreRuntime();
  });

  it("opens one subject from the indexed syllabus instead of the catalog blob", () => {
    expect(src("services/courses/course-service.ts")).toMatch(
      /getCourseById[\s\S]*getStoredCourseDetail\(ref\)/,
    );
    expect(src("services/courses/course-service.ts")).toMatch(
      /getCourseDetail[\s\S]*getStoredCourseDetail\(id\)/,
    );
    expect(src("services/learning/access.ts")).not.toMatch(/ensureCoursesSeeded/);
    expect(src("app/api/learning/courses/[courseId]/lessons/[lessonId]/route.ts")).toMatch(
      /if \(!existingProgress\)/,
    );
    expect(src("services/courses/store.ts")).toMatch(/syncCourseDetailsFromDatabase\(working\)/);
    expect(src("lib/data/lms-course-detail-store.ts")).toContain(
      'const TABLE = "aep_lms_course_details"',
    );
    expect(src("database/migrations/045_lms_course_detail_store.sql")).toMatch(
      /CREATE TABLE IF NOT EXISTS aep_lms_course_details/,
    );
  });

  it("resolves Instrumentation by id or official code without seeding the catalog", () => {
    upsertCourseDetail(sampleDetail());
    expect(getStoredCourseDetail("ATPL-022")?.id).toBe("course-atpl-022");
    expect(getCourseById("course-atpl-022")?.code).toBe("ATPL-022");
    const detail = getCourseDetail("ATPL-022");
    expect(detail?.modules[0]?.lessons[0]?.id).toBe("c272ff046b70564504ae59b5b31afadf");
    expect(detail?.title).toMatch(/Instrumentation/i);
  });

  it("matches the official first-lecture subject code 022 to Instrumentation", () => {
    expect(firstLectureMatchesCourse("course-atpl-022", "022")).toBe(true);
    expect(firstLectureMatchesCourse("course-atpl-022", "ATPL-022")).toBe(true);
    expect(firstLectureMatchesCourse("course-atpl-061", "022")).toBe(false);
    expect(src("services/learning/learning-service.ts")).not.toMatch(
      /getLiveClassroomForStudentCourse[\s\S]*ensureClassesSeeded\(\)/,
    );
  });
});
