import { afterEach, describe, expect, it } from "vitest";

import {
  PRODUCTION_SITE_URL,
  appJoinUrl,
  canonicalCertificateVerifyUrl,
  getBaseUrl,
  publicAppOrigin,
  publicAppUrl,
  publicCertificateVerifyUrl,
  rewriteAppAbsoluteUrl,
} from "@/lib/site-origin";

const keys = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_ENV",
  "VERCEL_ENV",
  "APP_URL",
  "VERCEL_URL",
] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function productionEnv() {
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.VERCEL_ENV = "production";
}

describe("getBaseUrl / publicAppOrigin", () => {
  it("uses www.aviatorpass.com in production even when Vercel project URL is set", () => {
    productionEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://aviatorpass.vercel.app";
    expect(publicAppOrigin()).toBe(PRODUCTION_SITE_URL);
    expect(getBaseUrl()).toBe(PRODUCTION_SITE_URL);
  });

  it("rejects localhost NEXT_PUBLIC_APP_URL in production", () => {
    productionEnv();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(getBaseUrl()).toBe(PRODUCTION_SITE_URL);
  });

  it("rejects 127.0.0.1 and VERCEL_URL fallbacks in production", () => {
    productionEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "aviatorpass.vercel.app";
    expect(getBaseUrl()).toBe(PRODUCTION_SITE_URL);
  });

  it("keeps an explicit aviatorpass.com production URL as www", () => {
    productionEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://www.aviatorpass.com";
    expect(publicAppOrigin()).toBe("https://www.aviatorpass.com");
  });

  it("uses the env URL outside production", () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(publicAppOrigin()).toBe("http://localhost:3000");
  });
});

describe("rewriteAppAbsoluteUrl / appJoinUrl", () => {
  it("rewrites stored localhost join URLs in production", () => {
    productionEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(rewriteAppAbsoluteUrl("http://localhost:3000/join/class-1?mid=123456789")).toBe(
      "https://www.aviatorpass.com/join/class-1?mid=123456789",
    );
  });

  it("rewrites Vercel preview join URLs in production", () => {
    productionEnv();
    expect(rewriteAppAbsoluteUrl("https://aviatorpass.vercel.app/join/class-1?host=1&mid=9")).toBe(
      "https://www.aviatorpass.com/join/class-1?host=1&mid=9",
    );
  });

  it("leaves Zoom provider URLs unchanged", () => {
    productionEnv();
    expect(rewriteAppAbsoluteUrl("https://zoom.us/j/987654321")).toBe(
      "https://zoom.us/j/987654321",
    );
  });

  it("builds production Join URLs on www.aviatorpass.com", () => {
    productionEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appJoinUrl("class-1", "123456789")).toBe(
      "https://www.aviatorpass.com/join/class-1?mid=123456789",
    );
    expect(appJoinUrl("class-1", "123456789", true)).toBe(
      "https://www.aviatorpass.com/join/class-1?host=1&mid=123456789",
    );
    expect(publicAppUrl("/verify/certificate?code=ABC")).toBe(
      "https://www.aviatorpass.com/verify/certificate?code=ABC",
    );
  });

  it("always uses production for certificate verification URLs", () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(publicCertificateVerifyUrl("ABC")).toBe(
      "https://www.aviatorpass.com/verify/certificate?code=ABC",
    );
    expect(canonicalCertificateVerifyUrl("http://localhost:3000/verify/certificate?code=ABC")).toBe(
      "https://www.aviatorpass.com/verify/certificate?code=ABC",
    );
  });
});
