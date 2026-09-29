import {
  atplPackageSubjectTitle,
  easaCodeFromAtplCourseCode,
} from "@/constants/atpl-complete-package";
import { getCourseById } from "@/services/courses/course-service";

/**
 * Certificate subject line must be the real ATPL / course title, never a slug or code.
 */
export function resolveCertificateSubjectName(input: {
  courseId?: string | null;
  fallback?: string | null;
}): string {
  const fallback = input.fallback?.trim() || "";
  if (input.courseId) {
    const course = getCourseById(input.courseId);
    if (course) {
      const official =
        atplPackageSubjectTitle(course.code) ??
        atplPackageSubjectTitle(
          typeof course.metadata?.subjectCode === "string" ? course.metadata.subjectCode : null,
        );
      if (official) return official;
      if (course.title?.trim()) return course.title.trim();
    }
    const fromId = atplPackageSubjectTitle(input.courseId);
    if (fromId) return fromId;
  }
  const fromFallback =
    atplPackageSubjectTitle(fallback) ??
    atplPackageSubjectTitle(easaCodeFromAtplCourseCode(fallback));
  if (fromFallback) return fromFallback;
  return fallback || "Aviation subject";
}
