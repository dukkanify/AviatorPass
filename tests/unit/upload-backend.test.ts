import { existsSync, readFileSync, rmSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectStorageHealth,
  putUploadedFile,
  resolveUploadBackend,
} from "@/lib/ops/upload-backend";

describe("upload backend", () => {
  const written: string[] = [];

  afterEach(() => {
    for (const file of written) {
      rmSync(file, { force: true });
    }
    written.length = 0;
  });

  it("uses local public/uploads outside Vercel", () => {
    expect(
      resolveUploadBackend({
        provider: "local",
        supabaseConfigured: false,
        env: {},
      }),
    ).toBe("local");
    const health = inspectStorageHealth({
      provider: "local",
      supabaseConfigured: false,
      env: {},
    });
    expect(health.status).toBe("pass");
    expect(health.detail).toMatch(/local/i);
  });

  it("fails health on Vercel when no durable backend is configured", () => {
    const health = inspectStorageHealth({
      provider: "local",
      supabaseConfigured: false,
      env: { VERCEL: "1", VERCEL_ENV: "production" },
    });
    expect(health.status).toBe("fail");
    expect(health.backend).toBe("unavailable");
    expect(health.detail).toMatch(/BLOB_READ_WRITE_TOKEN|ephemeral/i);
  });

  it("prefers Vercel Blob on ephemeral hosts when the token is present", () => {
    expect(
      resolveUploadBackend({
        provider: "local",
        supabaseConfigured: true,
        env: { VERCEL: "1", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test" },
      }),
    ).toBe("vercel_blob");
  });

  it("uses Supabase when that provider is selected and configured", () => {
    expect(
      resolveUploadBackend({
        provider: "supabase",
        supabaseConfigured: true,
        env: { VERCEL: "1" },
      }),
    ).toBe("supabase");
    expect(
      resolveUploadBackend({
        provider: "supabase",
        supabaseConfigured: false,
        env: {},
      }),
    ).toBe("unavailable");
  });

  it("refuses local writes on Vercel without a durable backend", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      await expect(
        putUploadedFile({
          relativePath: "health-check/blocked.txt",
          bytes: Buffer.from("no"),
          contentType: "text/plain",
        }),
      ).rejects.toThrow(/Durable storage is not configured/);
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("writes a local file for development uploads", async () => {
    const relativePath = `health-check/${Date.now()}-probe.txt`;
    const stored = await putUploadedFile({
      relativePath,
      bytes: Buffer.from("ok"),
      contentType: "text/plain",
    });
    expect(stored.backend).toBe("local");
    expect(stored.publicUrl).toBe(`/uploads/${relativePath}`);
    expect(existsSync(stored.storagePath)).toBe(true);
    expect(readFileSync(stored.storagePath, "utf8")).toBe("ok");
    written.push(stored.storagePath);
    written.push(path.join(process.cwd(), "public", "uploads", relativePath));
  });
});
