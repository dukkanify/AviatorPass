/**
 * Canonical public origin for redirects (Stripe Checkout, emails, invoices).
 * Production always uses www.aviatorpass.com even if NEXT_PUBLIC_APP_URL is a
 * Vercel preview/project hostname.
 */

export const PRODUCTION_SITE_URL = "https://www.aviatorpass.com";

export function publicAppOrigin(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const production =
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (production) {
    if (envUrl && /^https:\/\/(www\.)?aviatorpass\.com\/?$/i.test(envUrl)) {
      return envUrl.replace(/\/$/, "");
    }
    return PRODUCTION_SITE_URL;
  }

  return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}
