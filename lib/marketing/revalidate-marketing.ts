/**
 * Bust ISR cache for marketing pages after Super Admin CMS edits.
 */

import { revalidatePath } from "next/cache";

import { SITE_COPY_PAGES } from "@/services/marketing/site-copy-catalog";
import type { SiteCopyPageId } from "@/types/site-copy";

/** Paths that read shared marketing stores (site copy, slider, ATPL packages, catalog). */
export const MARKETING_REVALIDATE_PATHS = [
  "/",
  "/atpl",
  "/about",
  "/qa",
  "/contact",
  "/flightpath",
  "/live",
  "/instructors",
  "/online-courses",
  "/online-courses/basics",
  "/online-courses/ppl",
  "/online-courses/elp",
  "/courses",
] as const;

const LAYOUT_PATHS = new Set(["/", "/courses", "/online-courses", "/atpl"]);

function bust(path: string, type?: "page" | "layout") {
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  } catch {
    // Vitest / workers without a Next static generation store.
  }
}

export function revalidateMarketingPaths(paths: readonly string[] = MARKETING_REVALIDATE_PATHS) {
  for (const path of paths) {
    bust(path);
    if (LAYOUT_PATHS.has(path)) bust(path, "layout");
  }
}

/** Course publish / hide / catalog grouping — public course pages must refresh. */
export function revalidateCoursePublishing() {
  revalidateMarketingPaths(["/", "/atpl", "/courses", "/online-courses", "/live", "/instructors"]);
  bust("/courses/[id]", "page");
}

export function siteCopyRevalidatePaths(pageId: SiteCopyPageId): string[] {
  const page = SITE_COPY_PAGES.find((row) => row.id === pageId);
  const path = page?.path || "/";
  if (pageId === "home" || pageId === "atpl") {
    return Array.from(new Set([path, "/", "/atpl"]));
  }
  return [path];
}

export function revalidateSiteCopyPage(pageId: SiteCopyPageId) {
  revalidateMarketingPaths(siteCopyRevalidatePaths(pageId));
}
