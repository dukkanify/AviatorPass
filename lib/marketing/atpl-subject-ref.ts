import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import { listAtplPackageReviewSubjects } from "@/services/marketing/atpl-package-review";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

/** Short public URLs for official ATPL subjects (`/courses/met`). */
export const ATPL_SUBJECT_PUBLIC_ALIASES: Record<string, readonly string[]> = {
  "022": ["instrumentation", "instruments"],
  "061": ["general-navigation", "gnav"],
  "062": ["radio-navigation", "rnav"],
  "050": ["met", "meteorology", "meteo"],
  "040": ["human-performance", "hpl"],
  "021": ["agk", "aircraft-general-knowledge"],
  "010": ["air-law", "airlaw"],
  "033": ["flight-planning", "fpm"],
  "032": ["performance"],
  "070": ["operational-procedures", "ops"],
  "081": ["principles-of-flight", "pof"],
  "031": ["mass-and-balance", "mass-balance"],
  "090": ["communications", "comms"],
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRef(value: string): string {
  return decodeURIComponent(value || "")
    .trim()
    .toLowerCase()
    .replace(/^atpl-/, "")
    .replace(/^course-/, "");
}

export function atplSubjectPublicSlug(code: string, title: string): string {
  const aliases = ATPL_SUBJECT_PUBLIC_ALIASES[code];
  if (aliases?.[0]) return aliases[0];
  return slugify(title) || code.toLowerCase();
}

export function atplSubjectPublicHref(subject: { code: string; title: string }): string {
  return `/courses/${encodeURIComponent(atplSubjectPublicSlug(subject.code, subject.title))}`;
}

export function resolveAtplSubjectRef(ref: string): AtplLandingSubjectPublic | null {
  const key = normalizeRef(ref);
  if (!key) return null;

  const subjects = listAtplPackageReviewSubjects();
  const official = ATPL_COMPLETE_PACKAGE_SUBJECTS.find((item) => {
    if (item.code.toLowerCase() === key) return true;
    if (slugify(item.title) === key) return true;
    return (ATPL_SUBJECT_PUBLIC_ALIASES[item.code] ?? []).includes(key);
  });
  if (!official) return null;
  return subjects.find((row) => row.code === official.code) ?? null;
}
