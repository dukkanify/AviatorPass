#!/usr/bin/env node
/**
 * Poll live production health until env/gitRef/target match production/main.
 * Usage: node scripts/wait-production-health.mjs [baseUrl]
 */
const BASE = (process.argv[2] || "https://www.aviatorpass.com").replace(/\/$/, "");
const attempts = 36;
const delayMs = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let i = 1; i <= attempts; i += 1) {
  try {
    const res = await fetch(`${BASE}/api/health`, { redirect: "follow" });
    const json = await res.json();
    const d = json.deployment || {};
    const ok = json.env === "production" && d.gitRef === "main" && d.target === "production";
    console.log(
      `poll ${i}/${attempts} env=${json.env} gitRef=${d.gitRef} target=${d.target} sha=${String(d.gitSha || "").slice(0, 12)}`,
    );
    if (ok) {
      console.log("PASS  production health");
      process.exit(0);
    }
  } catch (error) {
    console.log(`poll ${i}/${attempts} error ${error.message || error}`);
  }
  await sleep(delayMs);
}

console.error("FAIL  production health did not reach env=production gitRef=main target=production");
process.exit(1);
