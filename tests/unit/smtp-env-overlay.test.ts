import { afterEach, describe, expect, it } from "vitest";

import { applyRuntimeEmailOverrides } from "@/services/settings/settings-service";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("SMTP env overlay", () => {
  it("applies SMTP_HOST and sender overrides on top of stored settings", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_USER = "apikey";
    process.env.SMTP_PASSWORD = "secret";
    process.env.SMTP_FROM = "noreply@aviatorpass.com";
    process.env.SMTP_FROM_NAME = "AviatorPass Mail";

    const next = applyRuntimeEmailOverrides(DEFAULT_PLATFORM_SETTINGS);
    expect(next.email.smtpHost).toBe("smtp.example.com");
    expect(next.email.smtpPort).toBe(2525);
    expect(next.email.smtpUsername).toBe("apikey");
    expect(next.email.smtpPassword).toBe("secret");
    expect(next.email.senderEmail).toBe("noreply@aviatorpass.com");
    expect(next.email.senderName).toBe("AviatorPass Mail");
    expect(next.email.provider).toBe("smtp");
  });

  it("leaves stored settings unchanged when SMTP env is absent", () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const next = applyRuntimeEmailOverrides(DEFAULT_PLATFORM_SETTINGS);
    expect(next.email.smtpHost).toBe(DEFAULT_PLATFORM_SETTINGS.email.smtpHost);
  });

  it("treats Resend as the provider when only RESEND_API_KEY is set", () => {
    delete process.env.SMTP_HOST;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "AviatorPass <noreply@aviatorpass.com>";
    process.env.ADMIN_NOTIFICATION_EMAIL = "ops@aviatorpass.com";
    const next = applyRuntimeEmailOverrides(DEFAULT_PLATFORM_SETTINGS);
    expect(next.email.provider).toBe("resend");
    expect(next.email.senderEmail).toBe("noreply@aviatorpass.com");
    expect(next.email.senderName).toBe("AviatorPass");
    expect(next.email.adminNotificationEmail).toBe("ops@aviatorpass.com");
  });
});
