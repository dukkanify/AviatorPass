/**
 * Build and persist one syllabus row per course so student reads never
 * walk the full catalog blob.
 */

import { listEnrollmentsForCourse } from "@/lib/data/lms-enrollment-store";
import { replaceAllCourseDetails } from "@/lib/data/lms-course-detail-store";
import type { CoursesDatabase } from "@/services/courses/store";
import type { CourseDetail } from "@/types/courses";

export function buildCourseDetailsFromDatabase(db: CoursesDatabase): CourseDetail[] {
  const modulesByCourse = new Map<string, CoursesDatabase["modules"]>();
  for (const row of db.modules) {
    const list = modulesByCourse.get(row.courseId) ?? [];
    list.push(row);
    modulesByCourse.set(row.courseId, list);
  }
  const lessonsByModule = new Map<string, CoursesDatabase["lessons"]>();
  for (const row of db.lessons) {
    const list = lessonsByModule.get(row.moduleId) ?? [];
    list.push(row);
    lessonsByModule.set(row.moduleId, list);
  }
  const resourcesByLesson = new Map<string, CoursesDatabase["resources"]>();
  for (const row of db.resources) {
    const list = resourcesByLesson.get(row.lessonId) ?? [];
    list.push(row);
    resourcesByLesson.set(row.lessonId, list);
  }
  const instructorsByCourse = new Map<string, CoursesDatabase["instructors"]>();
  for (const row of db.instructors) {
    const list = instructorsByCourse.get(row.courseId) ?? [];
    list.push(row);
    instructorsByCourse.set(row.courseId, list);
  }

  return db.courses
    .filter((course) => !course.deletedAt)
    .map((course) => {
      const modules = [...(modulesByCourse.get(course.id) ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((mod) => ({
          ...mod,
          lessons: [...(lessonsByModule.get(mod.id) ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((lesson) => ({
              ...lesson,
              resources: [...(resourcesByLesson.get(lesson.id) ?? [])].sort(
                (a, b) => a.order - b.order,
              ),
            })),
        }));
      const lessons = modules.flatMap((mod) => mod.lessons);
      const resources = lessons.flatMap((lesson) => lesson.resources);
      const enrollments = listEnrollmentsForCourse(course.id);
      const category = course.categoryId
        ? db.categories.find((row) => row.id === course.categoryId)
        : null;
      return {
        ...course,
        categoryName: category?.name ?? null,
        primaryInstructorName: null,
        counts: {
          modules: modules.length,
          lessons: lessons.length,
          resources: resources.length,
          enrollments: enrollments.length,
          activeEnrollments: enrollments.filter((row) => row.status === "approved").length,
        },
        modules,
        instructors: instructorsByCourse.get(course.id) ?? [],
      } satisfies CourseDetail;
    });
}

export function syncCourseDetailsFromDatabase(db: CoursesDatabase): void {
  if (db.courses.length === 0) return;
  replaceAllCourseDetails(buildCourseDetailsFromDatabase(db));
}
