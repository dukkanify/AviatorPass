import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACCOUNT_STATUS } from "@/constants/account-status";
import { ROLES } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { startEnterpriseRegistration } from "@/services/auth/registration-service";
import { readAuthDb, writeAuthDb } from "@/services/auth/store";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";
import { patchStoredSettings } from "@/services/settings/store";
import { registerSchema } from "@/utils/validation";

const ORIGINAL_ENV = { ...process.env };
const TEST_EMAIL_SUFFIX = "@regflow.test";

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}${TEST_EMAIL_SUFFIX}`;
}

function uniquePhone() {
  return `+9655${Math.floor(1000000 + Math.random() * 8999999)}`;
}

function cleanup() {
  writeAuthDb((db) => {
    db.pendingRegistrations = db.pendingRegistrations.filter(
      (p) => !p.email.endsWith(TEST_EMAIL_SUFFIX),
    );
    db.otps = db.otps.filter((o) => !o.email.endsWith(TEST_EMAIL_SUFFIX));
    db.users = db.users.filter((u) => !u.email.endsWith(TEST_EMAIL_SUFFIX));
  });
}

describe("registration verification flow", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    cleanup();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    cleanup();
  });

  it("keeps the pending account when verification email delivery fails", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    patchStoredSettings(
      {
        email: {
          ...DEFAULT_PLATFORM_SETTINGS.email,
          smtpHost: "",
          senderEmail: "noreply@aviatorpass.test",
        },
      },
      null,
    );

    const email = uniqueEmail("failmail");
    const payload = registerSchema.parse({
      firstName: "Lina",
      lastName: "Khan",
      email,
      phone: uniquePhone(),
      countryCode: "KW",
      nationality: "Kuwaiti",
      password: "Secret12!",
      confirmPassword: "Secret12!",
      acceptTerms: true,
      acceptPrivacy: true,
      role: "student",
    });

    const started = await startEnterpriseRegistration(payload);
    expect(started.success).toBe(true);
    expect(started.data?.verificationEmailSent).toBe(false);
    expect(started.data?.emailDelivery).toBe("failed");
    expect(started.error).toBeNull();
    expect(readAuthDb().pendingRegistrations.some((p) => p.email === email)).toBe(true);
    expect(readAuthDb().otps.some((o) => o.email === email && o.purpose === "register")).toBe(true);
  });

  it("returns a field hint for duplicate email and phone", async () => {
    const email = uniqueEmail("dup");
    const phone = uniquePhone();
    const payload = registerSchema.parse({
      firstName: "Omar",
      lastName: "Saleh",
      email,
      phone,
      countryCode: "AE",
      nationality: "Emirati",
      password: "Secret12!",
      confirmPassword: "Secret12!",
      acceptTerms: true,
      acceptPrivacy: true,
      role: "student",
    });
    expect((await startEnterpriseRegistration(payload)).success).toBe(true);

    writeAuthDb((db) => {
      const pending = db.pendingRegistrations.find((p) => p.email === email);
      if (!pending) return;
      db.users.push({
        id: "user-dup-test",
        email,
        firstName: pending.firstName,
        lastName: pending.lastName,
        phone,
        countryCode: "AE",
        nationality: "Emirati",
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
        status: ACCOUNT_STATUS.ACTIVE,
        emailVerified: true,
        profileComplete: false,
        mustChangePassword: false,
        passwordHash: pending.passwordHash,
        passwordSalt: pending.passwordSalt,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const emailClash = await startEnterpriseRegistration({
      ...payload,
      phone: uniquePhone(),
    });
    expect(emailClash.success).toBe(false);
    expect(emailClash.field).toBe("email");
    expect(emailClash.error).toMatch(/email already exists/i);

    const phoneClash = await startEnterpriseRegistration({
      ...payload,
      email: uniqueEmail("other"),
      phone,
    });
    expect(phoneClash.success).toBe(false);
    expect(phoneClash.field).toBe("phone");
    expect(phoneClash.error).toMatch(/phone number already exists/i);
  });

  it("uses /verify-email after registration and keeps live password UX", () => {
    expect(routes.verifyEmail).toBe("/verify-email");
    const form = readFileSync(
      path.join(process.cwd(), "features/auth/components/register-form.tsx"),
      "utf8",
    );
    expect(form).toContain("PASSWORD_REQUIREMENTS");
    expect(form).toContain("Passwords match");
    expect(form).toContain("disabled={!canSubmit}");
    expect(form).toContain("routes.verifyEmail");
    expect(form).toContain("passwordBlurred");
    expect(form).toContain("PASSWORD_SPECIAL_ERROR");
    expect(form).not.toMatch(/"Password must include a special character"/);
    const verify = readFileSync(
      path.join(process.cwd(), "features/auth/components/verify-otp-form.tsx"),
      "utf8",
    );
    expect(verify).toContain("Resend Verification Email");
    expect(verify).toContain("couldn't send the verification email");
    expect(verify).toContain("autoRetryStarted");
    expect(verify).not.toContain("Enter the 6-digit code we sent to your inbox.");
  });
});
