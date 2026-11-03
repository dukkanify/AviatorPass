/**
 * Production env guards must not throw (throws 500 Server Components).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("getServerEnv production guards", () => {
  it("forces demo OTP off instead of throwing in production", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.ENABLE_DEMO_OTP = "true";
    process.env.AUTH_SECRET = "strong-production-secret-value-32";
    process.env.DEMO_OTP_CODE = "123456";

    const { getServerEnv } = await import("@/config/env");
    const env = getServerEnv();
    expect(env.ENABLE_DEMO_OTP).toBe(false);
  });

  it("forces demo OTP off when VERCEL_ENV is production", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.VERCEL_ENV = "production";
    process.env.ENABLE_DEMO_OTP = "true";
    process.env.AUTH_SECRET = "strong-production-secret-value-32";

    const { getServerEnv, isLiveProductionRuntime } = await import("@/config/env");
    expect(isLiveProductionRuntime()).toBe(true);
    expect(getServerEnv().ENABLE_DEMO_OTP).toBe(false);
  });

  it("does not re-inject DemoPass123! via ensureCatalogDemoPassword on live Production", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.AUTH_SECRET = "strong-production-secret-value-32";

    const { PRIMARY_DEMO_EMAILS } = await import("@/constants/demo-accounts");
    const { writeAuthDb, findUserByEmail } = await import("@/services/auth/store");
    const { ensureCatalogDemoPassword } = await import("@/services/auth/demo-users");

    const email = PRIMARY_DEMO_EMAILS.student;
    writeAuthDb((db) => {
      const row = db.users.find((user) => user.email === email);
      if (!row) return;
      row.passwordHash = null;
      row.passwordSalt = null;
    });
    const next = ensureCatalogDemoPassword(findUserByEmail(email)!);
    expect(next.passwordHash).toBeFalsy();
    expect(next.passwordSalt).toBeFalsy();
  });
});
