#!/usr/bin/env node
/**
 * Verify this working tree is AviatorPass-only (no Sooqna / marketplace product contamination).
 * Exit 0 on success; non-zero with a clear report on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const notes = [];

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
}

// 1) Package identity
const pkg = readJson("package.json");
if (pkg.name !== "aviatorpass") {
  errors.push(`package.json name is "${pkg.name}" (expected "aviatorpass")`);
} else {
  notes.push(`package name: ${pkg.name}`);
}
if (/sooqna/i.test(pkg.description || "")) {
  errors.push("package.json description mentions Sooqna");
}

// 2) Forbidden workflow / product files on AviatorPass tip
const forbidden = [
  ".github/workflows/deploy-main-production.yml",
  ".github/workflows/deploy-production.yml",
];
for (const f of forbidden) {
  if (exists(f)) errors.push(`forbidden file present: ${f}`);
}

// 3) Sooqna source markers must not exist
const sooqnaMarkers = [
  "app/listings",
  "app/categories",
  "app/escrow",
  "app/admin/escrow",
  "app/admin/listings",
];
for (const m of sooqnaMarkers) {
  if (exists(m)) errors.push(`Sooqna route tree found: ${m}`);
}

// 4) Env / data stores
if (exists(".env.example")) {
  const envEx = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  if (/sooqna/i.test(envEx)) errors.push(".env.example contains Sooqna references");
  if (!/AviatorPass|ATPL/i.test(envEx) && !/NEXT_PUBLIC_APP_NAME/.test(envEx)) {
    notes.push(".env.example present (APP_NAME check soft)");
  }
}
const dataDir = path.join(root, ".data");
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  const sooqnaData = files.filter((f) => /sooqna/i.test(f));
  if (sooqnaData.length) errors.push(`.data contains marketplace files: ${sooqnaData.join(", ")}`);
  const aep = files.filter((f) => f.startsWith("aep-"));
  notes.push(`.data aep-* files: ${aep.length}`);
}

// 5) Workflow text must not deploy sooqna project
const apDeploy = path.join(root, ".github/workflows/deploy-aviatorpass-production.yml");
if (fs.existsSync(apDeploy)) {
  const txt = fs.readFileSync(apDeploy, "utf8");
  if (/project sooqna|VERCEL_SOOQNA|VERCEL_DEPLOY_HOOK/.test(txt)) {
    errors.push(
      "deploy-aviatorpass-production.yml still references shared/Sooqna deploy secrets or project",
    );
  }
  if (!/project aviatorpass|VERCEL_AVIATORPASS_DEPLOY_HOOK/.test(txt)) {
    errors.push("deploy-aviatorpass-production.yml missing AviatorPass project/hook references");
  }
} else {
  errors.push("missing .github/workflows/deploy-aviatorpass-production.yml");
}

// 6) CI must target AviatorPass production branches only (main is OK once dedicated repo)
const ci = path.join(root, ".github/workflows/ci.yml");
if (fs.existsSync(ci)) {
  const txt = fs.readFileSync(ci, "utf8");
  if (!/NEXT_PUBLIC_APP_NAME:\s*AviatorPass/.test(txt)) {
    errors.push("ci.yml missing NEXT_PUBLIC_APP_NAME: AviatorPass");
  }
  if (/project sooqna|VERCEL_SOOQNA|sooqna-web/i.test(txt)) {
    errors.push("ci.yml references marketplace product");
  }
}

// 7) Git remotes must point only to AviatorPass (no legacy UAE-Sales / Sooqnah remotes)
try {
  const remotes = execSync("git remote -v", { encoding: "utf8" }).trim().split("\n");
  const remoteNames = [...new Set(remotes.map((line) => line.split("\t")[0]))];
  for (const name of remoteNames) {
    if (/legacy|uae-sales|sooqna/i.test(name)) {
      errors.push(`forbidden git remote name: ${name}`);
    }
  }
  const remoteUrls = remotes.join("\n");
  if (/UAE-Sales|sooqna\.site/i.test(remoteUrls)) {
    errors.push("git remotes still reference UAE-Sales or sooqna.site");
  }
  if (!/AviatorPass/i.test(remoteUrls)) {
    errors.push("origin must reference github.com/dukkanify/AviatorPass");
  }
  notes.push(`git remotes: ${remoteNames.join(", ")}`);
} catch {
  notes.push("git remotes not available for cross-check (ok)");
}

// 8) origin/main must remain AviatorPass after dedicated-repo cutover
try {
  const mainPkg = execSync("git show origin/main:package.json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const mainName = JSON.parse(mainPkg).name;
  notes.push(`origin/main package name: ${mainName}`);
  if (mainName !== "aviatorpass") {
    errors.push(`origin/main package name is "${mainName}" (expected "aviatorpass")`);
  }
} catch {
  notes.push("origin/main not available for cross-check (ok)");
}

const report = {
  ok: errors.length === 0,
  package: pkg.name,
  errors,
  notes,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
