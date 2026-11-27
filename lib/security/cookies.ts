import { cookies } from "next/headers";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import { generateToken, hashValue } from "@/lib/security/crypto";
import {
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  CSRF_COOKIE,
  signSessionJwt,
  verifySessionJwt,
  type SessionJwtPayload,
} from "@/lib/security/session-token";

export { SESSION_COOKIE, SESSION_HINT_COOKIE, CSRF_COOKIE, verifySessionJwt };
export type { SessionJwtPayload };

export function hashSessionToken(token: string): string {
  return hashValue(token);
}

/**
 * Share auth cookies across apex + www in production so a session created on
 * either host survives the Vercel apex→www redirect (and the reverse).
 * Host-only cookies on localhost / preview (no Domain attribute).
 */
function sessionCookieDomain(): string | undefined {
  const production =
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (!production) return undefined;
  return ".aviatorpass.com";
}

export function sessionCookieOptions(maxAgeSeconds: number): Partial<ResponseCookie> {
  const domain = sessionCookieDomain();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || Boolean(domain),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain ? { domain } : {}),
  };
}

function splitSessionCookie(value: string): { jwt: string; rawToken: string } | null {
  const parts = value.split(".");
  // JWT = header.payload.signature (3 parts) + rawToken
  if (parts.length < 4) return null;
  const rawToken = parts[parts.length - 1]!;
  const jwt = parts.slice(0, 3).join(".");
  return { jwt, rawToken };
}

export async function setSessionCookies(
  sessionId: string,
  rawToken: string,
  claims: {
    userId: string;
    role: string;
    status: string;
    profileComplete: boolean;
    mustChangePassword?: boolean;
  },
  maxAgeSeconds: number,
): Promise<void> {
  const jwt = await signSessionJwt(
    {
      sid: sessionId,
      uid: claims.userId,
      th: hashSessionToken(rawToken),
      role: claims.role,
      status: claims.status,
      pc: claims.profileComplete,
      mp: Boolean(claims.mustChangePassword),
    },
    maxAgeSeconds,
  );

  const store = await cookies();
  const opts = sessionCookieOptions(maxAgeSeconds);
  store.set(SESSION_COOKIE, `${jwt}.${rawToken}`, opts);
  store.set(SESSION_HINT_COOKIE, "1", {
    httpOnly: false,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
    ...(opts.domain ? { domain: opts.domain } : {}),
  });
}

type AuthCookieWriter = {
  set(name: string, value: string, options?: Partial<ResponseCookie>): unknown;
};

function expiredAuthCookieOptions(): Array<Partial<ResponseCookie>> {
  const domain = sessionCookieDomain();
  const base: Partial<ResponseCookie> = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || Boolean(domain),
  };
  const variants: Array<Partial<ResponseCookie>> = [{ ...base }];
  if (domain) variants.push({ ...base, domain });
  return variants;
}

function serializeExpiredCookie(name: string, options: Partial<ResponseCookie>): string {
  const parts = [
    `${name}=`,
    `Path=${options.path ?? "/"}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "SameSite=lax",
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

function expireCookieVariants(): Array<Partial<ResponseCookie>> {
  const domain = sessionCookieDomain();
  const variants = expiredAuthCookieOptions();
  // Always drop Domain=.aviatorpass.com leftovers, even on preview/local.
  if (!domain) variants.push({ ...variants[0]!, domain: ".aviatorpass.com" });
  return variants;
}

/** Expire session + signed-in hint for host-only and Domain=.aviatorpass.com cookies. */
export function writeExpiredAuthCookies(store: AuthCookieWriter): void {
  for (const extra of expireCookieVariants()) {
    store.set(SESSION_COOKIE, "", { ...extra, httpOnly: true });
    store.set(SESSION_HINT_COOKIE, "", { ...extra, httpOnly: false });
  }
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  writeExpiredAuthCookies(store);
}

type CookieResponse = {
  cookies: AuthCookieWriter;
  headers?: { append(name: string, value: string): void };
};

/**
 * Attach expired auth cookies to a Route Handler / middleware response.
 * Next cookie jars key by name, so append both host-only and Domain variants
 * instead of response.cookies.set (last write would drop one of them).
 */
export function applyExpiredAuthCookies<T extends CookieResponse>(response: T): T {
  if (!response.headers?.append) {
    writeExpiredAuthCookies(response.cookies);
    return response;
  }
  for (const extra of expireCookieVariants()) {
    response.headers.append(
      "Set-Cookie",
      serializeExpiredCookie(SESSION_COOKIE, { ...extra, httpOnly: true }),
    );
    response.headers.append(
      "Set-Cookie",
      serializeExpiredCookie(SESSION_HINT_COOKIE, { ...extra, httpOnly: false }),
    );
  }
  return response;
}

export async function readSessionCookie(): Promise<{
  payload: SessionJwtPayload;
  rawToken: string;
} | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const split = splitSessionCookie(value);
  if (!split) return null;
  const payload = await verifySessionJwt(split.jwt);
  if (!payload) return null;
  return { payload, rawToken: split.rawToken };
}

export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = generateToken(24);
  const domain = sessionCookieDomain();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production" || Boolean(domain),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
    ...(domain ? { domain } : {}),
  });
  return token;
}

export async function validateCsrfHeader(headerValue: string | null): Promise<boolean> {
  if (!headerValue) return false;
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return false;
  return cookieToken === headerValue;
}
