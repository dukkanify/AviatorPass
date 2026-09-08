/**
 * Durable JSON helpers with Postgres write-through when DATABASE_URL is set.
 *
 * Order of backends:
 *  1. Postgres `aep_json_store` (production) — hydrate on first access, persist every write
 *  2. `.data/*.json` files when the filesystem is writable
 *  3. In-process memory on read-only hosts (local tests / accidental missing DATABASE_URL)
 *
 * Vitest stays on file/memory unless AEP_TEST_POSTGRES=1 so unit tests never
 * touch the production database.
 */

import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import {
  getDatabaseUrl,
  neonSql,
  pingPostgres,
  PostgresStoreError,
} from "@/lib/data/neon-sql-sync";

const rawMemory = new Map<string, string>();
const parsedMemory = new Map<string, unknown>();

const hydratedKeys = new Set<string>();
let tableReady = false;

export function dataDir(): string {
  return path.join(process.cwd(), ".data");
}

export function storeKeyFromPath(filePath: string): string {
  return path.basename(filePath);
}

export function postgresStoreEnabled(): boolean {
  if (process.env.AEP_DISABLE_POSTGRES === "1") return false;
  if (process.env.VITEST && process.env.AEP_TEST_POSTGRES !== "1") return false;
  return Boolean(getDatabaseUrl());
}

export function requireDurableWrites(): boolean {
  if (!postgresStoreEnabled()) return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_APP_ENV === "production" ||
    process.env.AEP_REQUIRE_POSTGRES === "1"
  );
}

export type JsonStoreBackend = "postgres" | "file" | "memory";

export function getJsonStoreStatus(): {
  backend: JsonStoreBackend;
  writable: boolean;
  detail: string;
  latencyMs?: number;
} {
  if (postgresStoreEnabled()) {
    const ping = pingPostgres();
    return {
      backend: "postgres",
      writable: ping.ok,
      detail: ping.ok
        ? `Postgres aep_json_store · ${ping.detail}`
        : `Postgres configured but unreachable: ${ping.detail}`,
      latencyMs: ping.latencyMs,
    };
  }

  try {
    const dir = dataDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.R_OK | constants.W_OK);
    return {
      backend: "file",
      writable: true,
      detail: "Local JSON files under .data",
    };
  } catch {
    return {
      backend: "memory",
      writable: false,
      detail: "Data directory not writable — in-memory only (set DATABASE_URL)",
    };
  }
}

const CHUNK_CHARS = 12_000;
const CHUNK_READ_PAGE = 4;

function ensureTable(): void {
  if (tableReady) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS aep_json_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`
    CREATE TABLE IF NOT EXISTS aep_json_store_chunks (
      key TEXT NOT NULL,
      chunk_index INT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (key, chunk_index)
    )
  `);
  tableReady = true;
}

function readChunkedValue(key: string): unknown | undefined {
  const meta = neonSql<{ max: number | string | null }>(
    "SELECT COALESCE(MAX(chunk_index), -1) AS max FROM aep_json_store_chunks WHERE key = $1",
    [key],
  );
  const max = Number(meta[0]?.max ?? -1);
  if (max < 0) return undefined;
  let text = "";
  for (let start = 0; start <= max; start += CHUNK_READ_PAGE) {
    const rows = neonSql<{ chunk_index: number; data: string }>(
      `SELECT chunk_index, data FROM aep_json_store_chunks
       WHERE key = $1 AND chunk_index >= $2 AND chunk_index < $3
       ORDER BY chunk_index`,
      [key, start, start + CHUNK_READ_PAGE],
    );
    for (const row of rows) text += row.data ?? "";
  }
  return JSON.parse(text) as unknown;
}

function writeChunkedValue(key: string, value: unknown): void {
  const text = JSON.stringify(value);
  neonSql("DELETE FROM aep_json_store_chunks WHERE key = $1", [key]);
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 0;
  const flush = () => {
    if (!placeholders.length) return;
    neonSql(
      `INSERT INTO aep_json_store_chunks (key, chunk_index, data) VALUES ${placeholders.join(",")}`,
      values,
    );
    values.length = 0;
    placeholders.length = 0;
  };
  for (let i = 0; i < text.length; i += CHUNK_CHARS) {
    const base = values.length;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    values.push(key, idx, text.slice(i, i + CHUNK_CHARS));
    idx += 1;
    if (placeholders.length >= 8) flush();
  }
  flush();
  neonSql(
    `INSERT INTO aep_json_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify({ chunked: true, bytes: text.length, chunks: idx })],
  );
}

function hydrateKeyFromPostgres(filePath: string): void {
  if (!postgresStoreEnabled()) return;
  const key = storeKeyFromPath(filePath);
  if (hydratedKeys.has(key)) return;
  ensureTable();

  try {
    const chunked = readChunkedValue(key);
    if (chunked !== undefined) {
      rawMemory.set(filePath, JSON.stringify(chunked));
      parsedMemory.set(filePath, chunked);
      hydratedKeys.add(key);
      return;
    }
  } catch (error) {
    console.error("[data] chunked hydrate failed", key, error);
  }

  try {
    const rows = neonSql<{ value: unknown }>("SELECT value FROM aep_json_store WHERE key = $1", [
      key,
    ]);
    const value = rows[0]?.value;
    if (value && typeof value === "object" && value !== null && "chunked" in value) {
      hydratedKeys.add(key);
      return;
    }
    if (value !== undefined) {
      rawMemory.set(filePath, JSON.stringify(value));
      parsedMemory.set(filePath, value);
    }
  } catch (error) {
    // Oversized legacy JSONB rows can truncate over Neon HTTP — treat as missing.
    console.error("[data] jsonb hydrate skipped", key, error);
  }
  hydratedKeys.add(key);
}

function persistToPostgres(filePath: string, value: unknown): void {
  ensureTable();
  writeChunkedValue(storeKeyFromPath(filePath), value);
}

function writeLocalFile(filePath: string, raw: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, raw, "utf8");
    return true;
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !postgresStoreEnabled()) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      console.warn(
        `[data] write skipped for ${path.basename(filePath)}${code ? ` (${code})` : ""}`,
      );
    }
    return false;
  }
}

export function readJsonFile<T>(filePath: string, fallback: () => T): T {
  if (postgresStoreEnabled()) {
    try {
      hydrateKeyFromPostgres(filePath);
    } catch (error) {
      console.error("[data] postgres hydrate failed; using local fallback", error);
    }
  }

  if (parsedMemory.has(filePath)) {
    return parsedMemory.get(filePath) as T;
  }

  const mem = rawMemory.get(filePath);
  if (mem) {
    try {
      const parsed = JSON.parse(mem) as T;
      parsedMemory.set(filePath, parsed);
      return parsed;
    } catch {
      rawMemory.delete(filePath);
    }
  }

  try {
    if (!existsSync(filePath)) {
      const value = fallback();
      parsedMemory.set(filePath, value);
      return value;
    }
    const raw = readFileSync(filePath, "utf8");
    rawMemory.set(filePath, raw);
    const parsed = JSON.parse(raw) as T;
    parsedMemory.set(filePath, parsed);
    return parsed;
  } catch {
    const value = fallback();
    parsedMemory.set(filePath, value);
    return value;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  const raw = JSON.stringify(value, null, 2);
  rawMemory.set(filePath, raw);
  parsedMemory.set(filePath, value);

  if (postgresStoreEnabled()) {
    try {
      persistToPostgres(filePath, value);
    } catch (error) {
      if (requireDurableWrites()) {
        throw error instanceof PostgresStoreError
          ? error
          : new PostgresStoreError(
              error instanceof Error ? error.message : "Failed to persist JSON store",
            );
      }
      console.error("[data] postgres persist failed; memory copy kept", error);
    }
  }

  writeLocalFile(filePath, raw);
}

/** Drop cached entries (tests). */
export function clearJsonFileCache(filePath?: string): void {
  if (!filePath) {
    rawMemory.clear();
    parsedMemory.clear();
    hydratedKeys.clear();
    tableReady = false;
    return;
  }
  rawMemory.delete(filePath);
  parsedMemory.delete(filePath);
  hydratedKeys.delete(storeKeyFromPath(filePath));
}

/** Test helper — force the next read to reload from Postgres. */
export function resetJsonStoreRuntime(): void {
  clearJsonFileCache();
}
