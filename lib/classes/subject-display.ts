/**
 * Resolve a human ATPL / course subject name for live-class emails & notices.
 */

import {
  ATPL_PACKAGE_LECTURE_TITLE,
  atplPackageSubjectTitle,
} from "@/constants/atpl-complete-package";
import { officialCourseDisplayTitle } from "@/lib/courses/display-title";
import { getCourseById } from "@/services/courses/course-service";

export function subjectNameFromLiveClassTitle(
  title: string | null | undefined,
  courseTitle: string | null | undefined,
): string {
  const raw = (title ?? "").trim();
  const prefix = `${ATPL_PACKAGE_LECTURE_TITLE} · `;
  if (raw.startsWith(prefix)) {
    const stripped = raw.slice(prefix.length).trim();
    if (stripped) return stripped;
  }
  if (raw) return raw;
  return (courseTitle ?? "").trim() || "your subject";
}

/** Prefer official ATPL package name from courseId, then lecture title. */
export function resolveLiveClassSubjectName(liveClass: {
  title?: string | null;
  courseId?: string | null;
}): string {
  if (liveClass.courseId) {
    const course = getCourseById(liveClass.courseId);
    if (course) {
      const official = officialCourseDisplayTitle(course);
      if (official && official !== "Course") return official;
      const fromCode = atplPackageSubjectTitle(course.code);
      if (fromCode) return fromCode;
      if (course.title?.trim()) return course.title.trim();
    }
  }
  return subjectNameFromLiveClassTitle(liveClass.title, null);
}
