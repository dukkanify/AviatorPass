/**
 * Canonical public origin for redirects, Join Zoom links, emails, and invoices.
 * Production always uses https://www.aviatorpass.com — never localhost.
 */

export const PRODUCTION_SITE_URL = "https://www.aviatorpass.com";
export const DEVELOPMENT_SITE_URL = "http://localhost:3000";

export type BaseUrlRequest = {
  nextUrl?: { origin?: string };
};

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hostnameOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  const host = hostnameOf(origin);
  if (!host) return /localhost|127\.0\.0\.1/i.test(origin);
  return (
    host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")
  );
}

function isEphemeralAppOrigin(origin: string): boolean {
  if (isLoopbackOrigin(origin)) return true;
  const host = hostnameOf(origin);
  if (!host) return false;
  return (
    host.endsWith(".vercel.app") ||
    host === "aviatorpass.com" ||
    host === "dubai-test.blog" ||
    host === "www.dubai-test.blog"
  );
}

/**
 * Preferred order: NEXT_PUBLIC_APP_URL → APP_URL → VERCEL_URL → request.nextUrl.origin.
 * Never returns localhost, Vercel preview hosts, or old domains in production.
 */
export function getBaseUrl(request?: BaseUrlRequest): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_URL,
    request?.nextUrl?.origin,
  ];

  if (isProductionRuntime()) {
    for (const raw of candidates) {
      const origin = normalizeOrigin(raw);
      if (!origin || isLoopbackOrigin(origin) || isEphemeralAppOrigin(origin)) continue;
      if (/^https:\/\/(www\.)?aviatorpass\.com$/i.test(origin)) {
        return PRODUCTION_SITE_URL;
      }
    }
    return PRODUCTION_SITE_URL;
  }

  for (const raw of candidates) {
    const origin = normalizeOrigin(raw);
    if (origin) return origin;
  }
  return DEVELOPMENT_SITE_URL;
}

export function publicAppOrigin(request?: BaseUrlRequest): string {
  return getBaseUrl(request);
}

/** Rewrite localhost / Vercel / legacy app URLs to the current canonical origin. */
export function rewriteAppAbsoluteUrl(
  url: string | null | undefined,
  request?: BaseUrlRequest,
): string {
  if (!url) return url ?? "";
  try {
    const parsed = new URL(url);
    const shouldRewrite =
      isLoopbackOrigin(parsed.origin) ||
      (isProductionRuntime() && isEphemeralAppOrigin(parsed.origin));
    if (!shouldRewrite) return url;
    return `${getBaseUrl(request)}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export function appJoinUrl(token: string, meetingId: string, host = false): string {
  const mid = encodeURIComponent(meetingId);
  const path = host
    ? `/join/${encodeURIComponent(token)}?host=1&mid=${mid}`
    : `/join/${encodeURIComponent(token)}?mid=${mid}`;
  return `${getBaseUrl()}${path}`;
}

export function publicAppUrl(pathname: string, request?: BaseUrlRequest): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getBaseUrl(request)}${path}`;
}
