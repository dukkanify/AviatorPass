#!/usr/bin/env node
/**
 * Trigger AviatorPass production deploy via Cursor / GitHub secret
 * `VERCEL_AVIATORPASS_DEPLOY_HOOK` only. Never hardcode a hook URL.
 *
 * Usage: node scripts/trigger-production-deploy.mjs
 */
const hook = (process.env.VERCEL_AVIATORPASS_DEPLOY_HOOK || "").trim();
const projectId = (process.env.VERCEL_PROJECT_ID || "").trim();
const orgId = (process.env.VERCEL_ORG_ID || "").trim();
const token = (process.env.VERCEL_TOKEN || "").trim();

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

if (!hook) {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not set");
}

let parsed;
try {
  parsed = new URL(hook);
} catch {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not a valid URL");
}

if (parsed.protocol !== "https:") {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK must be https");
}
if (parsed.hostname !== "api.vercel.com") {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK host must be api.vercel.com");
}
if (!parsed.pathname.startsWith("/v1/integrations/deploy/")) {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not a Vercel deploy hook path");
}

const parts = parsed.pathname.replace(/\/$/, "").split("/");
const hookProjectId = parts[4];
const hookId = parts[5];
if (!hookProjectId || !hookId) {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is missing project or hook id");
}
if (projectId && hookProjectId !== projectId) {
  fail("VERCEL_AVIATORPASS_DEPLOY_HOOK does not match VERCEL_PROJECT_ID");
}

if (token && (projectId || hookProjectId)) {
  const id = projectId || hookProjectId;
  const query = orgId ? `?teamId=${encodeURIComponent(orgId)}` : "";
  const inspect = await fetch(`https://api.vercel.com/v9/projects/${id}${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (inspect.ok) {
    const project = await inspect.json();
    const live = project?.link?.deployHooks || [];
    const ok = live.some((h) => h.id === hookId);
    if (!ok) {
      fail(
        "VERCEL_AVIATORPASS_DEPLOY_HOOK is not a live hook on the aviatorpass project. Update the secret to the current Production hook.",
      );
    }
  }
}

const res = await fetch(hook, {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: "{}",
});

let body = null;
try {
  body = await res.json();
} catch {
  body = null;
}

if (res.status !== 201 && res.status !== 200) {
  const code = body?.error?.code || body?.error || res.statusText;
  fail(`POST $VERCEL_AVIATORPASS_DEPLOY_HOOK → HTTP ${res.status} (${code})`);
}

const jobId = body?.job?.id || body?.id || "unknown";
const state = body?.job?.state || body?.state || "unknown";
console.log(`PASS  POST $VERCEL_AVIATORPASS_DEPLOY_HOOK → HTTP ${res.status}`);
console.log(`job=${jobId} state=${state}`);
