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
import {
  listOrdersByStatus,
  listOrdersForEmail,
  listOrdersForStudent,
} from "@/lib/data/lms-payment-ledger-store";
import type { Order } from "@/types/payments";
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

function metaString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function paidOrderPhone(order: Order): string | null {
  return metaString(order.metadata, "phone") ?? metaString(order.metadata, "guestPhone");
}

export function paidOrderCountryCode(order: Order): string | null {
  const raw =
    (order.billingCountry || "").trim() || metaString(order.metadata, "guestCountry") || "";
  return raw ? raw.slice(0, 2).toUpperCase() : null;
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

function latestPaidOrderForIdentity(studentId: string, email: string): Order | null {
  const byId = new Map<string, Order>();
  for (const order of [...listOrdersForStudent(studentId), ...listOrdersForEmail(email)]) {
    if (order.status !== "paid") continue;
    byId.set(order.id, order);
  }
  return (
    [...byId.values()]
      .slice()
      .sort((a, b) => (b.paidAt ?? b.updatedAt).localeCompare(a.paidAt ?? a.updatedAt))[0] ?? null
  );
}

function applyPaidOrderContact(user: StoredUser, order: Order): boolean {
  const { firstName, lastName } = splitName(order.studentName || order.billingName || "");
  const phone = paidOrderPhone(order);
  const countryCode = paidOrderCountryCode(order);
  const nationality = user.nationality || countryName(countryCode);
  let changed = false;
  if (!user.firstName && firstName) {
    user.firstName = firstName;
    changed = true;
  }
  if (!user.lastName && lastName) {
    user.lastName = lastName;
    changed = true;
  }
  if (!user.phone && phone) {
    user.phone = phone;
    changed = true;
  }
  if (!user.countryCode && countryCode) {
    user.countryCode = countryCode;
    changed = true;
  }
  if (!user.nationality && nationality) {
    user.nationality = nationality;
    changed = true;
  }
  const complete = isStudentProfileComplete(user);
  if (user.profileComplete !== complete) {
    user.profileComplete = complete;
    changed = true;
  }
  return changed;
}

/** Fill missing student contact fields from the paid checkout order. */
export function completePaidStudentProfileFromOrder(
  userId?: string | null,
  email?: string | null,
): StoredUser | null {
  const user = (userId ? findUserById(userId) : null) ?? (email ? findUserByEmail(email) : null);
  if (!user || user.role !== ROLES.STUDENT) return user;
  if (isStudentProfileComplete(user)) {
    if (!user.profileComplete) {
      user.profileComplete = true;
      user.updatedAt = nowIso();
      upsertUser(user);
    }
    return user;
  }
  const order = latestPaidOrderForIdentity(user.id, user.email);
  if (!order) return user;
  if (!applyPaidOrderContact(user, order)) return user;
  user.updatedAt = nowIso();
  upsertUser(user);
  return user;
}

export function restoreMissingPaidIdentities(): StoredUser[] {
  const restored: StoredUser[] = [];
  for (const order of listOrdersByStatus("paid")) {
    const email = sanitizeEmail(order.studentEmail || order.billingEmail || "");
    const id = (order.studentId || "").trim();
    if (!email || !id || id === "guest") continue;
    if (findUserById(id) || findUserByEmail(email)) continue;

    const { firstName, lastName } = splitName(order.studentName || order.billingName || "");
    const countryCode = paidOrderCountryCode(order);
    const phone = paidOrderPhone(order);
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
