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

function ensureTable(): void {
  if (tableReady) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS aep_json_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

function hydrateKeyFromPostgres(filePath: string): void {
  if (!postgresStoreEnabled()) return;
  const key = storeKeyFromPath(filePath);
  if (hydratedKeys.has(key)) return;
  ensureTable();
  const rows = neonSql<{ value: unknown }>("SELECT value FROM aep_json_store WHERE key = $1", [
    key,
  ]);
  const row = rows[0];
  if (row && row.value !== undefined) {
    rawMemory.set(filePath, JSON.stringify(row.value));
    parsedMemory.set(filePath, row.value);
  }
  hydratedKeys.add(key);
}

function persistToPostgres(filePath: string, value: unknown): void {
  ensureTable();
  const key = storeKeyFromPath(filePath);
  neonSql(
    `INSERT INTO aep_json_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
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
      if (requireDurableWrites()) {
        throw error instanceof PostgresStoreError
          ? error
          : new PostgresStoreError(
              error instanceof Error ? error.message : "Failed to hydrate JSON store",
            );
      }
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
