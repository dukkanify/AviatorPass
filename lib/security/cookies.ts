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

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  const opts = sessionCookieOptions(0);
  store.set(SESSION_COOKIE, "", { ...opts, maxAge: 0 });
  store.set(SESSION_HINT_COOKIE, "", {
    httpOnly: false,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(opts.domain ? { domain: opts.domain } : {}),
  });
  // Also clear legacy host-only cookies from before Domain=.aviatorpass.com.
  if (opts.domain) {
    store.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    store.set(SESSION_HINT_COOKIE, "", {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
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
