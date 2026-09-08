/**
 * Synchronous Neon HTTP SQL helper.
 *
 * The JSON stores are sync (dozens of callers). Neon’s driver is async, so we
 * run a tiny Node child that talks to Neon’s HTTP `/sql` endpoint using only
 * built-in modules — no extra files to trace into the Vercel bundle.
 */

import { spawnSync } from "node:child_process";

export class PostgresStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresStoreError";
  }
}

export function getDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  return raw || undefined;
}

const HELPER = `
const https = require("https");
const http = require("http");
const { URL } = require("url");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const { databaseUrl, query, params } = JSON.parse(raw);
    const conn = new URL(databaseUrl);
    const body = Buffer.from(JSON.stringify({ query, params: params || [] }));
    const useHttp = conn.protocol === "http:";
    const lib = useHttp ? http : https;
    const req = lib.request({
      hostname: conn.hostname,
      port: conn.port || (useHttp ? 80 : 443),
      path: "/sql",
      method: "POST",
      headers: {
        "Neon-Connection-String": databaseUrl,
        "Content-Type": "application/json",
        "Content-Length": body.length,
        Accept: "application/json",
        "Neon-Raw-Text-Output": "false",
        "Neon-Array-Mode": "false",
      },
      timeout: 25000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode && res.statusCode >= 400) {
          process.stderr.write(text.slice(0, 2000));
          process.exit(1);
        }
        process.stdout.write(text);
        process.exit(0);
      });
    });
    req.on("error", (err) => {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    });
    req.on("timeout", () => {
      req.destroy();
      process.stderr.write("Neon SQL request timed out");
      process.exit(1);
    });
    req.write(body);
    req.end();
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err));
    process.exit(1);
  }
});
`;

export function neonSql<T = Record<string, unknown>>(query: string, params: unknown[] = []): T[] {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new PostgresStoreError("DATABASE_URL is not set");
  }

  const result = spawnSync(process.execPath, ["-e", HELPER], {
    input: JSON.stringify({ databaseUrl, query, params }),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 80 * 1024 * 1024,
    env: process.env,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "postgres query failed").trim();
    throw new PostgresStoreError(err.slice(0, 800));
  }

  const stdout = result.stdout.trim();
  if (!stdout) return [];

  const parsed = JSON.parse(stdout) as unknown;
  if (Array.isArray(parsed)) return parsed as T[];
  if (parsed && typeof parsed === "object") {
    const rows = (parsed as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export function pingPostgres(): { ok: boolean; detail: string; latencyMs: number } {
  const started = Date.now();
  try {
    const rows = neonSql<{ ok: number | string }>("SELECT 1 AS ok");
    const ok = rows.some((row) => Number(row.ok) === 1 || row.ok === "1");
    return {
      ok,
      detail: ok ? "Postgres reachable" : "Postgres ping returned no rows",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Postgres ping failed",
      latencyMs: Date.now() - started,
    };
  }
}
