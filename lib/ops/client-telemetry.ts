/**
 * Parse User-Agent and approximate IP location from request headers.
 * Prefers Vercel edge geo headers (real, request-time) over any stored demo data.
 */

export interface ParsedUserAgent {
  device: string;
  browser: string;
  os: string;
}

export interface ApproximateLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  label: string;
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = (userAgent || "").trim();
  if (!ua) {
    return { device: "Unknown", browser: "Unknown", os: "Unknown" };
  }

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let device = "Desktop";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) device = "Tablet";
  else if (/Mobile|iPhone|Android/i.test(ua)) device = "Mobile";

  return { device, browser, os };
}

export function locationFromHeaders(headers: Headers): ApproximateLocation {
  const city = decodeHeader(headers.get("x-vercel-ip-city"));
  const region = decodeHeader(
    headers.get("x-vercel-ip-country-region") ?? headers.get("x-vercel-ip-region"),
  );
  const country = decodeHeader(headers.get("x-vercel-ip-country"));
  return formatLocation(city, region, country);
}

export function locationFromParts(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): ApproximateLocation {
  return formatLocation(input.city ?? null, input.region ?? null, input.country ?? null);
}

function formatLocation(
  city: string | null,
  region: string | null,
  country: string | null,
): ApproximateLocation {
  const parts = [city, region, country].filter(Boolean) as string[];
  return {
    city,
    region,
    country,
    label: parts.length ? parts.join(", ") : "Unknown",
  };
}

function decodeHeader(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export function clientContextFromRequest(request: Request) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = request.headers.get("user-agent");
  const location = locationFromHeaders(request.headers);
  const ua = parseUserAgent(userAgent);
  return {
    ipAddress,
    userAgent,
    city: location.city,
    region: location.region,
    country: location.country,
    locationLabel: location.label,
    ...ua,
  };
}
