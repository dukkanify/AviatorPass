import { readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";

import { neonSql, PostgresStoreError } from "@/lib/data/neon-sql-sync";

/**
 * The SQL helper blocks the caller while a worker talks to Neon. A mock server
 * on that same thread never gets to answer, so the stand-in runs on its own thread.
 */
function mockNeon(status: number): Promise<{ port: number; stop: () => Promise<void> }> {
  const server = new Worker(
    `
const { parentPort } = require("node:worker_threads");
const http = require("node:http");
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    if (${status} >= 400) {
      res.statusCode = ${status};
      res.end("database unavailable");
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ ok: 1, query: body.query || "", path: req.url }]));
  });
});
server.listen(0, "127.0.0.1", () => {
  parentPort.postMessage({ port: server.address().port });
});
parentPort.on("message", () => server.close());
`,
    { eval: true },
  );
  return new Promise((resolve, reject) => {
    server.once("message", (message: { port: number }) => {
      resolve({
        port: message.port,
        stop: () =>
          new Promise<void>((done) => {
            server.once("exit", () => done());
            void server.terminate();
          }),
      });
    });
    server.once("error", reject);
  });
}

describe("neon sql sync", () => {
  const previous = process.env.DATABASE_URL;
  let stop: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    if (stop) await stop();
    stop = null;
  });

  it("keeps queries on one worker instead of spawning a process each time", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/data/neon-sql-sync.ts"), "utf8");
    expect(src).not.toContain("spawnSync");
    expect(src).toContain("new Worker");
  });

  it("reads rows from the Neon HTTP endpoint", async () => {
    const neon = await mockNeon(200);
    stop = neon.stop;
    process.env.DATABASE_URL = `http://127.0.0.1:${neon.port}/db`;

    const first = neonSql<{ ok: number; query: string; path: string }>("SELECT 1 AS ok");
    const second = neonSql<{ query: string }>("SELECT 2 AS ok");

    expect(first[0]).toMatchObject({ ok: 1, query: "SELECT 1 AS ok", path: "/sql" });
    expect(second[0]?.query).toBe("SELECT 2 AS ok");
  });

  it("surfaces HTTP failures as store errors", async () => {
    const neon = await mockNeon(500);
    stop = neon.stop;
    process.env.DATABASE_URL = `http://127.0.0.1:${neon.port}/db`;

    expect(() => neonSql("SELECT 1")).toThrow(PostgresStoreError);
  });
});
