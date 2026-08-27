"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets the viewport to the top of the document on every route change.
 *
 * App Router preserves scroll position in several navigation cases (notably
 * browser back/forward and same-layout transitions), which leaves internal
 * pages opening part-way down. Disabling the browser's automatic scroll
 * restoration and scrolling to the top whenever the pathname changes gives
 * consistent "open at the top" behaviour across menu links, internal links,
 * dashboard navigation, and browser back/forward, on both mobile and desktop.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default ScrollToTop;
