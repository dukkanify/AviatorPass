import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearJsonFileCache,
  dataDir,
  isRetryableJsonStoreError,
  postgresStoreEnabled,
  readJsonFile,
  resetJsonStoreRuntime,
  storeKeyFromPath,
  writeJsonFile,
} from "@/lib/data/json-file-store";

function loadDatabaseUrlFromFile(filePath: string): string | undefined {
  try {
    const text = readFileSync(filePath, "utf8");
    const line = text.split("\n").find((row) => row.startsWith("DATABASE_URL="));
    if (!line) return undefined;
    let value = line.slice("DATABASE_URL=".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || undefined;
  } catch {
    return undefined;
  }
}

describe("json file store keys", () => {
  it("maps store paths to durable keys", () => {
    expect(storeKeyFromPath(path.join(dataDir(), "aep-classes.json"))).toBe("aep-classes.json");
  });

  it("does not use Postgres during unit tests by default", () => {
    expect(postgresStoreEnabled()).toBe(false);
  });

  it("retries chunk writes that hit a duplicate-key race", () => {
    expect(
      isRetryableJsonStoreError(
        new Error('duplicate key value violates unique constraint "aep_json_store_chunks_pkey"'),
      ),
    ).toBe(true);
    expect(isRetryableJsonStoreError(new Error('{"code":"23505"}'))).toBe(true);
    expect(isRetryableJsonStoreError(new Error("connection refused"))).toBe(false);
    const src = readFileSync(path.join(process.cwd(), "lib/data/json-file-store.ts"), "utf8");
    expect(src).toMatch(/ON CONFLICT \(key, chunk_index\) DO UPDATE SET data = EXCLUDED\.data/);
    expect(src).toMatch(/chunk_index >= \$2/);
    expect(src).toMatch(/attempt < 3/);
    expect(src).toMatch(/SELECT updated_at FROM aep_json_store/);
    expect(src).toMatch(/cacheUpdatedAt/);
    expect(src).toMatch(/Chunked store \$\{key\} is incomplete/);
    expect(src).toMatch(/if \(requireDurableWrites\(\)\) throw error;/);
  });
});

describe("postgres json store persist", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    AEP_TEST_POSTGRES: process.env.AEP_TEST_POSTGRES,
  };

  afterEach(() => {
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.AEP_TEST_POSTGRES === undefined) delete process.env.AEP_TEST_POSTGRES;
    else process.env.AEP_TEST_POSTGRES = previous.AEP_TEST_POSTGRES;
    resetJsonStoreRuntime();
  });

  it("writes and reads back after a cache reset when DATABASE_URL is available", () => {
    const url =
      process.env.AEP_PERSIST_DATABASE_URL ||
      loadDatabaseUrlFromFile("/tmp/avp-prod.env") ||
      loadDatabaseUrlFromFile(path.join(process.cwd(), ".env.local"));
    if (!url) {
      expect(postgresStoreEnabled()).toBe(false);
      return;
    }

    process.env.DATABASE_URL = url;
    process.env.AEP_TEST_POSTGRES = "1";
    resetJsonStoreRuntime();
    expect(postgresStoreEnabled()).toBe(true);

    const filePath = path.join(dataDir(), "aep-persist-selftest.json");
    const marker = `persist-${Date.now()}`;
    writeJsonFile(filePath, { marker, writtenAt: new Date().toISOString() });
    clearJsonFileCache();
    const again = readJsonFile<{ marker: string }>(filePath, () => ({ marker: "missing" }));
    expect(again.marker).toBe(marker);
  });
});
