/**
 * Bust ISR cache for marketing pages after Super Admin CMS edits.
 */

import { revalidatePath } from "next/cache";

import { SITE_COPY_PAGES } from "@/services/marketing/site-copy-catalog";
import type { SiteCopyPageId } from "@/types/site-copy";

/** Paths that read shared marketing stores (site copy, slider, ATPL packages). */
export const MARKETING_REVALIDATE_PATHS = [
  "/",
  "/atpl",
  "/qa",
  "/contact",
  "/flightpath",
  "/live",
  "/online-courses",
  "/online-courses/basics",
  "/online-courses/ppl",
  "/online-courses/elp",
  "/courses",
] as const;

export function revalidateMarketingPaths(paths: readonly string[] = MARKETING_REVALIDATE_PATHS) {
  for (const path of paths) {
    revalidatePath(path);
  }
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
