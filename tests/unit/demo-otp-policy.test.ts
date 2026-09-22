import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { updatePlatformSettings } from "@/services/settings/settings-service";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  ensureDemoUsersSeeded();
});

afterEach(async () => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
  await updatePlatformSettings({
    patch: { authentication: { allowDemoOtp: true } },
    actorId: "test",
  });
});

describe("demo OTP handover policy", () => {
  it("stays off on live production even if env and FORCE_DEMO_OTP ask for it", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.ENABLE_DEMO_OTP = "true";
    process.env.FORCE_DEMO_OTP = "true";
    process.env.DEMO_OTP_CODE = "123456";
    process.env.AUTH_SECRET = "strong-production-secret-value-32";

    const { getServerEnv } = await import("@/config/env");
    const { demoOtpEnabled } = await import("@/services/auth/otp-service");

    expect(getServerEnv().ENABLE_DEMO_OTP).toBe(false);
    expect(demoOtpEnabled()).toBe(false);
  });

  it("stays off when only VERCEL_ENV is production", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.VERCEL_ENV = "production";
    process.env.ENABLE_DEMO_OTP = "true";
    process.env.FORCE_DEMO_OTP = "true";
    process.env.AUTH_SECRET = "strong-production-secret-value-32";

    const { isLiveProductionRuntime } = await import("@/config/env");
    const { demoOtpEnabled } = await import("@/services/auth/otp-service");

    expect(isLiveProductionRuntime()).toBe(true);
    expect(demoOtpEnabled()).toBe(false);
  });

  it("defaults ENABLE_DEMO_OTP off when the env var is missing", async () => {
    delete process.env.ENABLE_DEMO_OTP;
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    delete process.env.VERCEL_ENV;
    process.env.AUTH_SECRET = "strong-production-secret-value-32";

    const { getServerEnv } = await import("@/config/env");
    const { demoOtpEnabled } = await import("@/services/auth/otp-service");

    expect(getServerEnv().ENABLE_DEMO_OTP).toBe(false);
    expect(demoOtpEnabled()).toBe(false);
  });

  it("turns off when Super Admin disables allowDemoOtp", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    delete process.env.VERCEL_ENV;
    process.env.ENABLE_DEMO_OTP = "true";
    process.env.DEMO_OTP_CODE = "123456";

    await updatePlatformSettings({
      patch: { authentication: { allowDemoOtp: false } },
      actorId: "test",
    });

    const { demoOtpEnabled } = await import("@/services/auth/otp-service");
    const { requestOtp } = await import("@/services/auth/auth-service");

    expect(demoOtpEnabled()).toBe(false);
    const req = await requestOtp({
      email: "student@aviatorpass.com",
      purpose: "login",
      rememberMe: false,
    });
    expect(req.success).toBe(true);
    expect(req.data?.demoOtp).toBeUndefined();
  });
});
