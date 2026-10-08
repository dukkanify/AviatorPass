/**
 * Post-purchase password setup, package confirmation email, and admin password reset.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ATPL_INSTRUCTOR_CONFIRM_NOTICE,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
  validAtplPackageSchedule,
} from "@/constants/atpl-complete-package";
import { generateSecurePassword, verifyPassword } from "@/lib/security/crypto";
import { passwordLogin } from "@/services/auth/auth-service";
import { consumePasswordSetupToken } from "@/services/auth/password-setup-service";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, toUserProfile } from "@/services/auth/store";
import { renderAutomationTemplate } from "@/services/email/automation-templates";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getWelcomeByOrderId, payGuestCheckout } from "@/services/payments/purchase-first-service";
import { getOrder } from "@/services/payments/checkout-service";
import { writePaymentsDb } from "@/services/payments/store";
import { listAtplStudents } from "@/services/cgi/journey-service";
import { createManagedUser, updateManagedUser } from "@/services/users/user-admin-service";

describe("purchase password and package confirmation journey", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("puts a setup token on the welcome snapshot and confirms the ATPL package in email copy", async () => {
    const email = `welcome.password.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Aziz",
      lastName: "Buyer",
      email,
      phone: `+9655${String(Date.now()).slice(-7)}`,
      country: "KW",
      billingName: "Aziz Buyer",
      billingAddress: "Kuwait City",
      ...validAtplPackageSchedule(),
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `welcome-password-${Date.now()}`,
    });

    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome?.needsPasswordSetup).toBe(true);
    expect(welcome?.setupPasswordToken).toMatch(/[A-Za-z0-9_-]{10,}/);
    expect(welcome?.setupPasswordUrl).toContain("/setup-password");
    expect(welcome?.instructorAssignmentLabel).toBe(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);

    const again = getWelcomeByOrderId(result.order.id);
    expect(again?.setupPasswordToken).toBe(welcome?.setupPasswordToken);

    const password = generateSecurePassword(16);
    const consumed = await consumePasswordSetupToken({
      email,
      token: welcome!.setupPasswordToken!,
      password,
    });
    expect(consumed.success).toBe(true);
    expect(getWelcomeByOrderId(result.order.id)?.needsPasswordSetup).toBe(false);

    const signedIn = await passwordLogin({ email, password });
    expect(signedIn.success).toBe(true);
    expect(signedIn.data?.mustChangePassword).toBeFalsy();
  });

  it("renders package confirmed and pending instructor copy in purchase emails", () => {
    const rendered = renderAutomationTemplate(
      "registration",
      {
        recipientName: "Abdulaziz",
        detail: "ATPL Complete Package is confirmed.",
        packageName: "ATPL Complete Package",
        instructorAssignmentLabel: ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
        instructorConfirmNotice: ATPL_INSTRUCTOR_CONFIRM_NOTICE,
        scheduleNotice: "TKI 1 will confirm the first lecture.",
        passwordSetupUrl: "https://www.aviatorpass.com/setup-password?email=a@b.com&token=tok",
        accountEmail: "a@b.com",
      },
      "Welcome to Aviator Pass — package confirmed",
    );
    expect(rendered.html).toContain("Package confirmed");
    expect(rendered.html).toContain("ATPL Complete Package");
    expect(rendered.html).toContain(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);
    expect(rendered.html).toContain(ATPL_INSTRUCTOR_CONFIRM_NOTICE);
    expect(rendered.text).toMatch(/Pending Instructor Assignment/i);

    const payment = renderAutomationTemplate("payment", {
      recipientName: "Abdulaziz",
      title: "Package confirmed",
      detail: "ATPL Complete Package is confirmed.",
      packageName: "ATPL Complete Package",
      instructorAssignmentLabel: ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
      instructorConfirmNotice: ATPL_INSTRUCTOR_CONFIRM_NOTICE,
      amountLabel: "KWD 1.000",
      reference: "INV-2026-00002",
    });
    expect(payment.html).toContain("Package confirmed");
    expect(payment.html).toContain(ATPL_INSTRUCTOR_CONFIRM_NOTICE);
  });

  it("rebinds a paid ATPL order onto the live email account for CGI and welcome", async () => {
    const email = `rebind.buyer.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Rebind",
      lastName: "Buyer",
      email,
      phone: `+9655${String(Date.now() + 1).slice(-7)}`,
      country: "KW",
      billingName: "Rebind Buyer",
      billingAddress: "Kuwait City",
      ...validAtplPackageSchedule(),
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `rebind-${Date.now()}`,
    });
    const liveId = findUserByEmail(email)!.id;
    writePaymentsDb((db) => {
      const order = db.orders.find((row) => row.id === result.order.id);
      if (order) order.studentId = "ghost-student-id";
    });
    expect(getOrder(result.order.id)?.studentId).toBe("ghost-student-id");

    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome?.needsPasswordSetup).toBe(true);
    expect(getOrder(result.order.id)?.studentId).toBe(liveId);

    const cgi = listAtplStudents().find((row) => row.email === email);
    expect(cgi?.studentId).toBe(liveId);
    expect(cgi?.instructorAssignmentLabel).toBe(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);
  });

  it("lets a super admin set a student password from the console", async () => {
    const superAdmin = toUserProfile(findUserByEmail("superadmin@aviatorpass.com")!);
    const stamp = Date.now();
    const created = await createManagedUser(superAdmin, {
      firstName: "Locked",
      lastName: "Buyer",
      email: `locked.buyer.${stamp}@aviatorpass.test`,
      phone: "",
      role: "student",
    });
    const password = generateSecurePassword(16);
    const updated = await updateManagedUser(superAdmin, created.profile.id, {
      password,
      confirmPassword: password,
    });
    expect(updated.email).toBe(created.profile.email);
    const user = findUserByEmail(created.profile.email)!;
    expect(user.mustChangePassword).toBe(false);
    expect(verifyPassword(password, user.passwordHash!, user.passwordSalt!)).toBe(true);
    const signedIn = await passwordLogin({ email: created.profile.email, password });
    expect(signedIn.success).toBe(true);
  });

  it("keeps welcome, OTP, and admin password UI contracts", () => {
    const welcome = readFileSync(
      path.join(process.cwd(), "features/payments/components/welcome-view.tsx"),
      "utf8",
    );
    expect(welcome).toContain("Set your password");
    expect(welcome).toContain("ATPL_INSTRUCTOR_CONFIRM_NOTICE");
    expect(welcome).toContain("WelcomePasswordForm");

    const otp = readFileSync(
      path.join(process.cwd(), "features/auth/components/verify-otp-form.tsx"),
      "utf8",
    );
    expect(otp).toContain("Send verification code");
    expect(otp).toContain("Sign in with a password");
    expect(otp).toContain("No active code yet.");
    expect(otp).toContain("Resend Verification Email");

    const admin = readFileSync(
      path.join(process.cwd(), "features/users/components/user-form-dialog.tsx"),
      "utf8",
    );
    expect(admin).toContain("user-password");
    expect(admin).toContain("Leave blank to keep current");
  });
});
