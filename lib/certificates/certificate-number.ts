import { easaCodeFromAtplCourseCode } from "@/constants/atpl-complete-package";
import { getCourseById } from "@/services/courses/course-service";

const GENERIC_PREFIXES = new Set(["THE", "AND", "FOR", "AVI", "AVP"]);

function tokenFromCode(code: string | null | undefined): string | null {
  const raw = code?.trim() ?? "";
  if (!raw) return null;
  const easa = easaCodeFromAtplCourseCode(raw);
  if (easa) return easa;
  const token = raw
    .split(/[-_\s/]+/)
    .find((part) => /^[A-Za-z]{2,8}$/.test(part) || /^\d{3}$/.test(part));
  return token ? token.toUpperCase() : null;
}

function tokenFromTitle(title: string | null | undefined): string | null {
  const first =
    title
      ?.trim()
      .split(/\s+/)[0]
      ?.replace(/[^A-Za-z0-9]/g, "") ?? "";
  if (first.length < 2 || first.length > 8) return null;
  const upper = first.toUpperCase();
  if (GENERIC_PREFIXES.has(upper)) return null;
  return upper;
}

export function certificateNumberPrefix(input: {
  courseId?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
}): string {
  if (input.courseCode) {
    const fromCode = tokenFromCode(input.courseCode);
    if (fromCode) return fromCode;
  }
  if (input.courseId) {
    const course = getCourseById(input.courseId);
    const fromCourse = tokenFromCode(course?.code) ?? tokenFromTitle(course?.title);
    if (fromCourse) return fromCourse;
  }
  const fromTitle = tokenFromTitle(input.courseTitle);
  if (fromTitle) return fromTitle;
  return "AVP";
}

export function makeCourseCertificateNumber(input: {
  courseId?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  year?: number;
  suffix: string;
}): string {
  const prefix = certificateNumberPrefix(input);
  const year = input.year ?? new Date().getFullYear();
  const suffix = input.suffix.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "000001";
  return `${prefix}-${year}-${suffix}`;
}

/** Keep the unique tail, replace a hardcoded ATPL / AVP prefix with the course prefix. */
export function alignCertificateNumber(
  current: string,
  input: {
    courseId?: string | null;
    courseCode?: string | null;
    courseTitle?: string | null;
  },
): string {
  const prefix = certificateNumberPrefix(input);
  const match = current
    .trim()
    .toUpperCase()
    .match(/^(?:ATPL(?:-\d{3})?|AVP|[A-Z]{2,8}|\d{3})-(\d{4})-(.+)$/);
  if (!match) return current;
  const [, year, tail] = match;
  const next = `${prefix}-${year}-${tail}`;
  return next === current.toUpperCase() ? current : next;
}
