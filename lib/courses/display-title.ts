import { atplPackageSubjectTitle } from "@/constants/atpl-complete-package";

/** Placeholder titles from the ATPL package seed, e.g. `Lesson 1.1`. */
export function isGenericLessonTitle(title: string | null | undefined): boolean {
  return /^lesson\s*\d+(\.\d+)?$/i.test(title?.trim() ?? "");
}

export function isGenericModuleTitle(title: string | null | undefined): boolean {
  return /^module\s*\d+$/i.test(title?.trim() ?? "");
}

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

/** Lesson page heading: use the course name when the stored lesson is still `Lesson 1.1`. */
export function displayLessonHeading(
  lessonTitle: string | null | undefined,
  course: {
    code?: string | null;
    title?: string | null;
    metadata?: { subjectCode?: unknown } | null;
  },
): string {
  const courseTitle = officialCourseDisplayTitle(course);
  if (isGenericLessonTitle(lessonTitle)) return courseTitle;
  const lesson = lessonTitle?.trim() ?? "";
  return lesson || courseTitle;
}

/** Hide seed placeholders such as `Module 1` on the student player. */
export function displayModuleHeading(moduleTitle: string | null | undefined): string {
  if (isGenericModuleTitle(moduleTitle)) return "First lecture";
  return moduleTitle?.trim() || "Module";
}
