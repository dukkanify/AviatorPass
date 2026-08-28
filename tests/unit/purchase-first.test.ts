/**
 * Purchase-first ATPL enrollment — pay before account creation.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));

import { ROLES } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { generateSecurePassword } from "@/lib/security/crypto";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { changePassword, passwordLogin } from "@/services/auth/auth-service";
import { findUserByEmail, readAuthDb, writeAuthDb } from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import {
  getWelcomeByOrderId,
  payGuestCheckout,
  quoteGuestCheckout,
  startHostedCheckout,
} from "@/services/payments/purchase-first-service";
import { passwordSchema } from "@/utils/validation";

describe("purchase-first ATPL enrollment", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("points marketing Enrol CTAs at public checkout, not register", () => {
    const marketing = getAtplProgramMarketing();
    expect(marketing.landingHref).toBe(routes.atpl);
    expect(marketing.enrollHref.startsWith(routes.checkout)).toBe(true);
    expect(marketing.enrollHref).not.toContain("/register");
    expect(marketing.enrollHref).not.toContain("/student/checkout");
  });

  it("quotes ATPL with gateway-driven methods including wallets and future BNPL", () => {
    const quote = quoteGuestCheckout();
    expect(quote.product.metadata?.sku).toBe("ATPL-PACKAGE");
    expect(quote.totalAmount).toBeGreaterThan(0);
    expect(quote.hostedCheckout).toBe(false);
    const ids = quote.methods.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(["card", "apple_pay", "google_pay", "mada", "tabby", "tamara"]),
    );
    expect(quote.methods.find((m) => m.id === "card")?.available).toBe(true);
    expect(quote.methods.find((m) => m.id === "tabby")?.comingSoon).toBe(true);
  });

  it("does not create an account when payment fails", async () => {
    const email = `fail.guest.${Date.now()}@aviatorpass.test`;
    const before = readAuthDb().users.length;
    const result = await payGuestCheckout({
      firstName: "Fail",
      lastName: "Case",
      email,
      phone: "+96550001111",
      country: "KW",
      billingName: "Fail Case",
      billingAddress: "Kuwait City",
      methodBrand: "card",
      paymentToken: "fail",
      simulateFailure: true,
      idempotencyKey: `fail-${Date.now()}`,
    });
    expect(result.order.status).toBe("failed");
    expect(result.accountCreated).toBe(false);
    expect(findUserByEmail(email)).toBeNull();
    expect(readAuthDb().users.length).toBe(before);
  });

  it("creates a student, emails a one-time password, and enrolls ATPL after success", async () => {
    const email = `buy.guest.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Laila",
      lastName: "Hassan",
      email,
      phone: "+96550002222",
      country: "KW",
      billingName: "Laila Hassan",
      billingAddress: "Salmiya",
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `ok-${Date.now()}`,
    });

    expect(result.order.status).toBe("paid");
    expect(result.accountCreated).toBe(true);
    expect(result.temporaryPassword).toBeTruthy();
    expect(passwordSchema.parse(result.temporaryPassword)).toBe(result.temporaryPassword);

    const user = findUserByEmail(email);
    expect(user).toBeTruthy();
    expect(user!.role).toBe(ROLES.STUDENT);
    expect(user!.mustChangePassword).toBe(true);
    expect(user!.profileComplete).toBe(true);
    expect(user!.status).toBe("active");

    const enrollments = listStudentEnrollments(user!.id).filter((e) => e.status === "approved");
    expect(enrollments.length).toBeGreaterThan(0);
    expect(result.courseAssigned).toBe(true);

    const signedIn = await passwordLogin({
      email,
      password: result.temporaryPassword!,
    });
    expect(signedIn.success).toBe(true);
    expect(signedIn.data?.mustChangePassword).toBe(true);
    expect(signedIn.data?.redirectTo).toBe(routes.changePassword);

    const nextPassword = generateSecurePassword(16);
    const changed = await changePassword({
      userId: user!.id,
      currentPassword: result.temporaryPassword!,
      password: nextPassword,
    });
    expect(changed.success).toBe(true);
    expect(findUserByEmail(email)?.mustChangePassword).toBe(false);
    expect(changed.data?.redirectTo).toBe("/student/dashboard");
  });

  it("attaches a paid order to an existing email instead of duplicating the account", async () => {
    const email = `existing.guest.${Date.now()}@aviatorpass.test`;
    writeAuthDb((db) => {
      const now = new Date().toISOString();
      db.users.push({
        id: `exist-${Date.now()}`,
        email,
        firstName: "Existing",
        lastName: "Pilot",
        phone: "+96550003333",
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
        role: ROLES.STUDENT,
        status: "active",
        emailVerified: true,
        profileComplete: true,
        mustChangePassword: false,
        passwordHash: null,
        passwordSalt: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
    const beforeCount = readAuthDb().users.filter((u) => u.email === email).length;
    expect(beforeCount).toBe(1);

    const result = await payGuestCheckout({
      firstName: "Existing",
      lastName: "Pilot",
      email,
      phone: "+96550003333",
      country: "KW",
      billingName: "Existing Pilot",
      billingAddress: "Kuwait",
      methodBrand: "apple_pay",
      paymentToken: "tok_apple",
      idempotencyKey: `attach-${Date.now()}`,
    });

    expect(result.order.status).toBe("paid");
    expect(result.accountCreated).toBe(false);
    expect(result.attachedToExisting).toBe(true);
    expect(readAuthDb().users.filter((u) => u.email.toLowerCase() === email).length).toBe(1);
    const user = findUserByEmail(email)!;
    expect(listStudentEnrollments(user.id).some((e) => e.status === "approved")).toBe(true);
    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome?.accountCreated).toBe(false);
    expect(welcome?.attachedToExisting).toBe(true);
    expect(welcome?.courseAssigned).toBe(true);
    expect(welcome?.invoicePrintUrl).toBeTruthy();
  });

  it("exposes a welcome snapshot after a new guest purchase", async () => {
    const email = `welcome.guest.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Nora",
      lastName: "Rivera",
      email,
      phone: "+96550004444",
      country: "KW",
      billingName: "Nora Rivera",
      billingAddress: "Kuwait City",
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `welcome-${Date.now()}`,
    });
    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome).toBeTruthy();
    expect(welcome?.accountCreated).toBe(true);
    expect(welcome?.courseAssigned).toBe(true);
    expect(welcome?.emailSent).toBe(true);
    expect(welcome?.invoicePrintUrl).toContain(result.order.id);
  });

  it("refuses Stripe hosted checkout when the secret key is not configured", async () => {
    const previous = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await expect(startHostedCheckout({})).rejects.toMatchObject({
        name: "PaymentError",
        status: 503,
      });
    } finally {
      if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous;
    }
  });
});
