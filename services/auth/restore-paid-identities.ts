/**
 * Recreate paid-student login rows when the identity index lost them.
 * Orders and enrollments keep the original studentId.
 */

import { ACCOUNT_STATUS } from "@/constants/account-status";
import { ROLES } from "@/constants/roles";
import { COUNTRIES } from "@/constants/countries";
import {
  findUserByEmail,
  findUserById,
  isStudentProfileComplete,
  type StoredUser,
} from "@/services/auth/store";
import { upsertUser } from "@/lib/data/auth-identity-store";
import { listOrdersByStatus } from "@/lib/data/lms-payment-ledger-store";
import { sanitizeEmail, sanitizeString } from "@/utils/sanitize";

function nowIso() {
  return new Date().toISOString();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = sanitizeString(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Student",
    lastName: parts.slice(1).join(" ") || "Account",
  };
}

function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES.find((country) => country.code === code)?.name ?? null;
}

function avatarDataUri(initials: string): string {
  const safe =
    initials
      .replace(/[^A-Z]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "AP";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#143048"/><text x="64" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#F6C36C">${safe}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function restoreMissingPaidIdentities(): StoredUser[] {
  const restored: StoredUser[] = [];
  for (const order of listOrdersByStatus("paid")) {
    const email = sanitizeEmail(order.studentEmail || order.billingEmail || "");
    const id = (order.studentId || "").trim();
    if (!email || !id || id === "guest") continue;
    if (findUserById(id) || findUserByEmail(email)) continue;

    const { firstName, lastName } = splitName(order.studentName || order.billingName || "");
    const countryCode = (order.billingCountry || "").trim().slice(0, 2).toUpperCase() || null;
    const phone =
      typeof order.metadata.phone === "string" && order.metadata.phone.trim()
        ? order.metadata.phone.trim()
        : null;
    const ts = order.paidAt || order.createdAt || nowIso();
    const user: StoredUser = {
      id,
      email,
      firstName,
      lastName,
      phone,
      countryCode,
      nationality: countryName(countryCode),
      dateOfBirth: null,
      gender: null,
      city: null,
      bio: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      avatarUrl: avatarDataUri(`${firstName[0] ?? ""}${lastName[0] ?? ""}`),
      timezone: "UTC",
      language: "en",
      role: ROLES.STUDENT,
      status: ACCOUNT_STATUS.ACTIVE,
      emailVerified: true,
      profileComplete: false,
      mustChangePassword: true,
      passwordHash: null,
      passwordSalt: null,
      lastLoginAt: null,
      createdAt: ts,
      updatedAt: nowIso(),
    };
    user.profileComplete = isStudentProfileComplete(user);
    upsertUser(user);
    restored.push(user);
  }
  return restored;
}

export function paidOrderExistsForEmail(email: string): boolean {
  const normalized = sanitizeEmail(email);
  if (!normalized) return false;
  return listOrdersByStatus("paid").some((order) => {
    const orderEmail = sanitizeEmail(order.studentEmail || order.billingEmail || "");
    return orderEmail === normalized;
  });
}
