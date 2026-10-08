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
import {
  AVIATORPASS_CEO_EMAIL,
  INSTRUCTOR_ASSIGNMENT_OPS_RECIPIENTS,
  instructorAssignmentOpsSubject,
  renderInstructorAssignmentPendingOpsEmail,
} from "@/services/email/instructor-assignment-ops-email";
import { listOutboundEmails } from "@/services/email/outbox";
import { PROJECT_SUPPORT_EMAIL } from "@/lib/branding/legacy-client-identity";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getWelcomeByOrderId, payGuestCheckout } from "@/services/payments/purchase-first-service";
import { getOrder } from "@/services/payments/checkout-service";
import { writePaymentsDb } from "@/services/payments/store";
import { writeCoursesDb } from "@/services/courses/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import {
  getStudentAtplPackageSchedule,
  hydratePaidAtplStudentAccess,
  listAtplStudents,
} from "@/services/cgi/journey-service";
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

    const ops = listOutboundEmails(80).filter(
      (row) =>
        row.meta?.kind === "instructor_assignment_ops" && row.meta?.orderId === result.order.id,
    );
    expect(ops.map((row) => row.to).sort()).toEqual(
      [...INSTRUCTOR_ASSIGNMENT_OPS_RECIPIENTS].sort(),
    );
    expect(ops[0]?.subject).toBe(instructorAssignmentOpsSubject("Aziz Buyer"));
    expect(ops[0]?.html).toContain(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);
    expect(ops[0]?.html).toContain("Action Required");
  });

  it("renders the Support and CEO instructor-assignment notice in the requested format", () => {
    const rendered = renderInstructorAssignmentPendingOpsEmail({
      studentName: "ABDULAZIZ ALSHOAIL",
      studentEmail: "redarrow_@yahoo.com",
      phone: "+96595555030",
      country: "Kuwait",
      registrationDate: "8 Oct 2026",
      packageName: "ATPL Complete Package",
      preferredStartDate: "18 Oct 2026",
      preferredTrainingTime: "18:00",
      paymentMethod: "Credit Card",
      amountLabel: "KWD 1.000",
      adminDashboardUrl: "https://www.aviatorpass.com/cgi/dashboard",
    });
    expect(rendered.subject).toBe(
      "Action Required | New Student Registration – Instructor Assignment Pending | ABDULAZIZ ALSHOAIL",
    );
    expect(rendered.html).toContain("This email is for Support and CEO");
    expect(rendered.html).toContain("redarrow_@yahoo.com");
    expect(rendered.html).toContain("+96595555030");
    expect(rendered.html).toContain("Pending Instructor Assignment");
    expect(rendered.html).toContain("https://www.aviatorpass.com/cgi/dashboard");
    expect(rendered.html).toContain(PROJECT_SUPPORT_EMAIL);
    expect(AVIATORPASS_CEO_EMAIL).toBe("ceo@aviatorpass.com");
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
  }, 180_000);

  it("hydrates ATPL enrollments onto the live account after a ghost student id", async () => {
    const email = `hydrate.buyer.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Hydrate",
      lastName: "Buyer",
      email,
      phone: `+9655${String(Date.now() + 2).slice(-7)}`,
      country: "KW",
      billingName: "Hydrate Buyer",
      billingAddress: "Kuwait City",
      ...validAtplPackageSchedule(),
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `hydrate-${Date.now()}`,
    });
    const liveId = findUserByEmail(email)!.id;
    writePaymentsDb((db) => {
      const order = db.orders.find((row) => row.id === result.order.id);
      if (order) order.studentId = "ghost-hydrate-id";
    });
    writeCoursesDb((db) => {
      db.enrollments = db.enrollments.filter((row) => row.studentId !== liveId);
    });

    await hydratePaidAtplStudentAccess("ghost-hydrate-id", email, result.order.id);

    expect(getOrder(result.order.id)?.studentId).toBe(liveId);
    expect(getOrder(result.order.id)?.metadata.packageConfirmationFollowupAt).toBeTruthy();
    const enrolled = listStudentEnrollments(liveId).length;
    expect(enrolled).toBeGreaterThan(0);

    await hydratePaidAtplStudentAccess(liveId, email, result.order.id);
    expect(listStudentEnrollments(liveId)).toHaveLength(enrolled);

    const schedule = getStudentAtplPackageSchedule(liveId, email);
    expect(schedule.packageOwned).toBe(true);
    expect(schedule.orderId).toBe(result.order.id);
    expect(schedule.instructorAssignmentLabel).toBe(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);
  }, 180_000);

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

    const login = readFileSync(
      path.join(process.cwd(), "features/auth/components/login-form.tsx"),
      "utf8",
    );
    expect(login).toContain("Show password");
    expect(login).toContain("Hide password");
    expect(login).toContain('showPassword ? "text" : "password"');
    expect(login).toContain("loginNavigationLocked");
    expect(login).toContain(
      "if (loginNavigationLocked || completingRef.current || pending) return;",
    );
  });
});
