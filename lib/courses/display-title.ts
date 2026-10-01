import { atplPackageSubjectTitle } from "@/constants/atpl-complete-package";

/** Student / instructor / certificate title: official ATPL name, never `ATPL 010 — …`. */
export function officialCourseDisplayTitle(course: {
  code?: string | null;
  title?: string | null;
  metadata?: { subjectCode?: unknown } | null;
}): string {
  const official =
    atplPackageSubjectTitle(course.code) ??
    atplPackageSubjectTitle(
      typeof course.metadata?.subjectCode === "string" ? course.metadata.subjectCode : null,
    );
  const stored = course.title?.trim() ?? "";
  return official || stored || "Course";
}
