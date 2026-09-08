/**
 * Import local `.data/aep-*.json` files into Postgres `aep_json_store`.
 * Usage: DATABASE_URL=... node scripts/json-store-import.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SKIP = new Set(["aep-email-outbox.json", "aep-ops-logs.json"]);
const dataDir = path.join(process.cwd(), ".data");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const HELPER = `
const https = require("https");
const { URL } = require("url");
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  const { databaseUrl, query, params } = JSON.parse(raw);
  const conn = new URL(databaseUrl);
  const body = Buffer.from(JSON.stringify({ query, params: params || [] }));
  const req = https.request({
    hostname: conn.hostname,
    path: "/sql",
    method: "POST",
    headers: {
      "Neon-Connection-String": databaseUrl,
      "Content-Type": "application/json",
      "Content-Length": body.length,
    },
    timeout: 60000,
  }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (res.statusCode >= 400) { process.stderr.write(text.slice(0, 2000)); process.exit(1); }
      process.stdout.write(text);
    });
  });
  req.on("error", (e) => { process.stderr.write(String(e.message || e)); process.exit(1); });
  req.write(body);
  req.end();
});
`;

function sql(query, params = []) {
  const result = spawnSync(process.execPath, ["-e", HELPER], {
    input: JSON.stringify({ databaseUrl, query, params }),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "query failed").slice(0, 800));
  }
}

sql(`
  CREATE TABLE IF NOT EXISTS aep_json_store (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const files = readdirSync(dataDir).filter((f) => f.startsWith("aep-") && f.endsWith(".json"));
let imported = 0;
for (const file of files) {
  if (SKIP.has(file)) {
    console.log(`skip ${file}`);
    continue;
  }
  const value = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
  sql(
    `INSERT INTO aep_json_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [file, JSON.stringify(value)],
  );
  imported += 1;
  console.log(`imported ${file}`);
}
console.log(`done ${imported} stores`);
