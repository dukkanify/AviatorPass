import type { Course, CourseSeo } from "@/types/courses";

export const COURSE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/svg+xml";
export const COURSE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const COURSE_CURRENCIES = [
  { code: "AED", label: "UAE Dirham", flag: "🇦🇪" },
  { code: "SAR", label: "Saudi Riyal", flag: "🇸🇦" },
  { code: "KWD", label: "Kuwaiti Dinar", flag: "🇰🇼" },
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
] as const;

export function slugifyCourse(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatDurationHours(minutes: number): {
  hours: number;
  minutes: number;
  label: string;
} {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours <= 0) return { hours: 0, minutes: rest, label: `${rest} minutes` };
  if (rest === 0) return { hours, minutes: 0, label: `${hours} Hours` };
  return { hours, minutes: rest, label: `${hours}h ${rest}m` };
}

export function emptySeo(): CourseSeo {
  return { metaTitle: "", metaDescription: "", ogImageUrl: "", focusKeyword: "" };
}

export function courseSeoFrom(
  course?: Pick<Course, "metadata" | "title" | "shortDescription"> | null,
): CourseSeo {
  const raw = (course?.metadata?.seo ?? {}) as Partial<CourseSeo>;
  return {
    metaTitle: raw.metaTitle ?? course?.title ?? "",
    metaDescription: raw.metaDescription ?? course?.shortDescription ?? "",
    ogImageUrl: raw.ogImageUrl ?? "",
    focusKeyword: raw.focusKeyword ?? "",
  };
}

export function courseSlugFrom(
  course?: Pick<Course, "metadata" | "code" | "title"> | null,
): string {
  const slug = String(course?.metadata?.slug ?? "").trim();
  if (slug) return slug;
  return slugifyCourse(course?.code || course?.title || "");
}

export function seoScore(seo: CourseSeo, title: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 20;
  const metaTitle = seo.metaTitle.trim() || title.trim();
  if (metaTitle.length >= 30 && metaTitle.length <= 60) {
    score += 25;
  } else {
    notes.push("Meta title works best between 30 and 60 characters.");
  }
  if (seo.metaDescription.trim().length >= 80 && seo.metaDescription.trim().length <= 160) {
    score += 25;
  } else {
    notes.push("Meta description works best between 80 and 160 characters.");
  }
  if (
    seo.focusKeyword.trim() &&
    metaTitle.toLowerCase().includes(seo.focusKeyword.trim().toLowerCase())
  ) {
    score += 20;
  } else {
    notes.push("Include the focus keyword in the meta title.");
  }
  if (seo.ogImageUrl.trim()) score += 10;
  else notes.push("Add an Open Graph image.");
  return { score: Math.min(100, score), notes };
}

export function publicStudioHref(slug: string): string {
  const safe = slugifyCourse(slug) || "course";
  return `https://www.aviatorpass.com/courses/${safe}`;
}

export const COURSE_FORM_TABS = [
  { id: "basic", label: "Basic Information" },
  { id: "content", label: "Content" },
  { id: "pricing", label: "Pricing" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
  { id: "settings", label: "Settings" },
] as const;
