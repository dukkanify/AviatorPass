import { afterEach, describe, expect, it } from "vitest";

import { PRODUCTION_SITE_URL, publicAppOrigin } from "@/lib/site-origin";

const keys = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_ENV", "VERCEL_ENV"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("publicAppOrigin", () => {
  it("uses www.aviatorpass.com in production even when Vercel project URL is set", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://aviatorpass.vercel.app";
    expect(publicAppOrigin()).toBe(PRODUCTION_SITE_URL);
  });

  it("keeps an explicit aviatorpass.com production URL", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
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
