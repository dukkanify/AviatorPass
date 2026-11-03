/**
 * Synchronous Neon HTTP SQL helper.
 *
 * Callers are synchronous, so the request runs on one long-lived worker thread
 * and the caller waits on that result. A fresh Node process per query made
 * every dashboard read pay process startup on top of the database round trip.
 */

import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

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

const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const https = require("node:https");
const http = require("node:http");
const { URL } = require("node:url");

parentPort.on("message", (msg) => {
  const { databaseUrl, query, params, port, shared } = msg;
  const flag = new Int32Array(shared);
  const finish = (payload) => {
    try { port.postMessage(payload); } catch (err) {}
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
    try { port.close(); } catch (err) {}
  };
  try {
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
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode && res.statusCode >= 400) {
          finish({ ok: false, error: text.slice(0, 2000) });
          return;
        }
        finish({ ok: true, text });
      });
    });
    req.on("error", (err) => {
      finish({ ok: false, error: String(err && err.message ? err.message : err) });
    });
    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, error: "Neon SQL request timed out" });
    });
    req.write(body);
    req.end();
  } catch (err) {
    finish({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});
`;

type SqlPayload = { ok: true; text: string } | { ok: false; error: string };

let worker: Worker | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  const next = new Worker(WORKER_SOURCE, { eval: true });
  next.unref();
  next.on("error", () => {
    if (worker === next) worker = null;
  });
  next.on("exit", () => {
    if (worker === next) worker = null;
  });
  worker = next;
  return next;
}

function rowsFromPayload<T>(text: string): T[] {
  const stdout = text.trim();
  if (!stdout) return [];
  const parsed = JSON.parse(stdout) as unknown;
  if (Array.isArray(parsed)) return parsed as T[];
  if (parsed && typeof parsed === "object") {
    const rows = (parsed as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export function neonSql<T = Record<string, unknown>>(query: string, params: unknown[] = []): T[] {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new PostgresStoreError("DATABASE_URL is not set");
  }

  const { port1, port2 } = new MessageChannel();
  const shared = new SharedArrayBuffer(4);
  const flag = new Int32Array(shared);
  const current = getWorker();
  current.postMessage({ databaseUrl, query, params, port: port2, shared }, [port2]);
  const wait = Atomics.wait(flag, 0, 0, 25_000);
  const done = Atomics.load(flag, 0) === 1;
  if (!done) {
    void current.terminate();
    if (worker === current) worker = null;
    throw new PostgresStoreError(
      wait === "timed-out" ? "Neon SQL request timed out" : "Neon SQL worker stopped",
    );
  }

  const received = receiveMessageOnPort(port1);
  port1.close();
  if (!received) {
    throw new PostgresStoreError("Neon SQL worker returned no result");
  }
  const payload = received.message as SqlPayload;
  if (!payload.ok) {
    throw new PostgresStoreError(payload.error.slice(0, 800));
  }
  return rowsFromPayload<T>(payload.text);
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
