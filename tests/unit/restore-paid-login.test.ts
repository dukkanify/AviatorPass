import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));

import { readFileSync } from "node:fs";
import path from "node:path";

import { passwordLogin } from "@/services/auth/auth-service";
import {
  completePaidStudentProfileFromOrder,
  restoreMissingPaidIdentities,
} from "@/services/auth/restore-paid-identities";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, findUserById, writeAuthDb } from "@/services/auth/store";
import { resetAuthIdentityStoreRuntime, upsertUser } from "@/lib/data/auth-identity-store";
import { upsertOrder } from "@/lib/data/lms-payment-ledger-store";
import type { Order } from "@/types/payments";
import type { StoredUser } from "@/services/auth/store";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function paidOrder(suffix: string): Order {
  const now = new Date().toISOString();
  return {
    id: `ord-restore-login-${suffix}`,
    orderNumber: `ORD-RESTORE-${suffix}`,
    studentId: `student-restore-login-${suffix}`,
    studentName: "Abdulaziz Buyer",
    studentEmail: `restore.${suffix}@buyer.test`,
    status: "paid",
    currency: "KWD",
    subtotalAmount: 1000,
    discountAmount: 0,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: 1000,
    couponId: null,
    couponCode: null,
    billingName: "Abdulaziz Buyer",
    billingEmail: `restore.${suffix}@buyer.test`,
    billingCountry: "KW",
    billingAddress: "",
    items: [],
    paymentId: `pay-restore-login-${suffix}`,
    invoiceId: `inv-restore-login-${suffix}`,
    idempotencyKey: `idem-restore-login-${suffix}`,
    failureReason: null,
    paidAt: now,
    cancelledAt: null,
    expiresAt: null,
    metadata: { phone: "+96595555030" },
    createdAt: now,
    updatedAt: now,
  };
}

describe("restore paid student login", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
  });

  it("never deletes the SQL identity table on a catalog flush", () => {
    const identity = src("lib/data/auth-identity-store.ts");
    const start = identity.indexOf("export function replaceAllUsers");
    const end = identity.indexOf("export function getSessionById");
    expect(identity.slice(start, end)).not.toMatch(/DELETE FROM \$\{USER_TABLE\}/);
    expect(identity.slice(start, end)).toMatch(/upsertUser\(row\)/);
  });

  it("keeps a paid student when demo seed writes the auth catalog", () => {
    const stamp = new Date().toISOString();
    const paid: StoredUser = {
      id: "student-restore-keep-paid",
      email: "keep.paid@buyer.test",
      firstName: "Keep",
      lastName: "Paid",
      phone: "+96595555030",
      countryCode: "KW",
      nationality: "Kuwait",
      dateOfBirth: null,
      gender: null,
      city: null,
      bio: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      avatarUrl: null,
      timezone: "UTC",
      language: "en",
      role: "student",
      status: "active",
      emailVerified: true,
      profileComplete: true,
      mustChangePassword: false,
      passwordHash: "hash",
      passwordSalt: "salt",
      lastLoginAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    upsertUser(paid);
    writeAuthDb((db) => {
      const demo = db.users.find((user) => user.email === "student@aviatorpass.com");
      if (demo) demo.updatedAt = stamp;
    });
    resetAuthIdentityStoreRuntime();
    expect(findUserById(paid.id)?.email).toBe(paid.email);
  });

  it("restores a missing paid identity and binds the first valid password", async () => {
    const order = paidOrder(`bind-${Date.now()}`);
    upsertOrder(order);
    expect(findUserByEmail(order.studentEmail)).toBeNull();

    const restored = restoreMissingPaidIdentities();
    expect(restored.some((user) => user.id === order.studentId)).toBe(true);
    expect(findUserById(order.studentId)?.email).toBe(order.studentEmail);
    expect(findUserById(order.studentId)?.passwordHash).toBeNull();

    const signedIn = await passwordLogin({
      email: order.studentEmail,
      password: "RestorePass123!",
    });
    expect(signedIn.success).toBe(true);
    expect(signedIn.data?.user.email).toBe(order.studentEmail);

    const again = await passwordLogin({
      email: order.studentEmail,
      password: "RestorePass123!",
    });
    expect(again.success).toBe(true);
  });

  it("completes a restored paid profile from guestPhone checkout fields", async () => {
    const order = paidOrder(`guest-phone-${Date.now()}`);
    order.metadata = { guestPhone: "+96595555030", guestCountry: "KW" };
    upsertOrder(order);

    const restored = restoreMissingPaidIdentities();
    expect(restored.some((user) => user.id === order.studentId)).toBe(true);

    const user = findUserById(order.studentId);
    expect(user?.phone).toBe("+96595555030");
    expect(user?.countryCode).toBe("KW");
    expect(user?.nationality).toBe("Kuwait");
    expect(user?.profileComplete).toBe(true);

    const signedIn = await passwordLogin({
      email: order.studentEmail,
      password: "RestorePass123!",
    });
    expect(signedIn.success).toBe(true);
    expect(signedIn.data?.requiresProfile).toBe(false);
    expect(signedIn.data?.redirectTo).toBe("/student/dashboard");
  });

  it("backfills an incomplete paid student from the paid order", () => {
    const order = paidOrder(`backfill-${Date.now()}`);
    order.metadata = { guestPhone: "+96595555030" };
    upsertOrder(order);
    const stamp = new Date().toISOString();
    upsertUser({
      id: order.studentId,
      email: order.studentEmail,
      firstName: "Abdulaziz",
      lastName: "Buyer",
      phone: null,
      countryCode: null,
      nationality: null,
      dateOfBirth: null,
      gender: null,
      city: null,
      bio: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      avatarUrl: null,
      timezone: "UTC",
      language: "en",
      role: "student",
      status: "active",
      emailVerified: true,
      profileComplete: false,
      mustChangePassword: false,
      passwordHash: "hash",
      passwordSalt: "salt",
      lastLoginAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const filled = completePaidStudentProfileFromOrder(order.studentId, order.studentEmail);
    expect(filled?.phone).toBe("+96595555030");
    expect(filled?.countryCode).toBe("KW");
    expect(filled?.nationality).toBe("Kuwait");
    expect(filled?.profileComplete).toBe(true);
    expect(findUserById(order.studentId)?.profileComplete).toBe(true);
  });
});
