/**
 * Post-login return paths. Only same-origin relative paths that the
 * signed-in role is allowed to open. Rejects open redirects.
 */

import { ROLE_DASHBOARD, ROLES, type Role } from "@/constants/roles";
import type { UserProfile } from "@/types";

const SHARED_PREFIXES = ["/join", "/dashboard"] as const;

const ROLE_PREFIXES: Record<string, readonly Role[]> = {
  "/student": [ROLES.STUDENT],
  "/instructor": [ROLES.INSTRUCTOR, ROLES.CHIEF_GROUND_INSTRUCTOR],
  "/cgi": [ROLES.CHIEF_GROUND_INSTRUCTOR],
  "/admin": [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  "/super-admin": [ROLES.SUPER_ADMIN],
};

function pathOnly(value: string): string {
  const noHash = value.split("#")[0] ?? value;
  const q = noHash.indexOf("?");
  return q >= 0 ? noHash.slice(0, q) : noHash;
}

/** Relative in-app path, or null when the value is not a safe return target. */
export function sanitizeReturnPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value || value.length > 512) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.includes("\\")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("://") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  const path = pathOnly(value);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;

  const blocked =
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/register" ||
    path.startsWith("/register/") ||
    path === "/verify-otp" ||
    path.startsWith("/api/") ||
    path === "/api";
  if (blocked) return null;

  return value.split("#")[0] ?? null;
}

export function roleMayFollowReturnPath(role: Role, rawPath: string): boolean {
  const safe = sanitizeReturnPath(rawPath);
  if (!safe) return false;
  const path = pathOnly(safe);

  for (const prefix of SHARED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }

  for (const [prefix, roles] of Object.entries(ROLE_PREFIXES)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return roles.includes(role);
    }
  }

  return false;
}

/**
 * Role home, unless a validated return path is allowed for this account.
 * Password rotation, pending instructor approval, and incomplete profiles
 * still win over the requested page.
 */
export function postAuthRedirect(profile: UserProfile, requested?: string | null): string {
  if (profile.mustChangePassword) return "/change-password";
  if (profile.role === ROLES.INSTRUCTOR && profile.status === "pending") {
    return "/instructor-pending";
  }
  if (!profile.profileComplete) return "/complete-profile";

  const next = sanitizeReturnPath(requested);
  if (next && roleMayFollowReturnPath(profile.role, next)) return next;
  return ROLE_DASHBOARD[profile.role];
}
