#!/usr/bin/env node
/**
 * Trigger AviatorPass production deploy via Cursor / GitHub secret
 * `VERCEL_AVIATORPASS_DEPLOY_HOOK` only. Never hardcode a hook URL.
 *
 * Keep inspect rules aligned with lib/ops/production-deploy-hook.ts.
 *
 * Usage: node scripts/trigger-production-deploy.mjs
 *
 * On GitHub Actions `push` to main, a missing hook is SKIP (Vercel Git still
 * deploys). Local `npm run deploy:production` and workflow_dispatch still FAIL
 * until the secret is set.
 */

const projectId = (process.env.VERCEL_PROJECT_ID || "").trim();
const orgId = (process.env.VERCEL_ORG_ID || "").trim();
const token = (process.env.VERCEL_TOKEN || "").trim();

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function inspectDeployHook(env) {
  const hook = String(env.VERCEL_AVIATORPASS_DEPLOY_HOOK || "").trim();
  const expectedProject = String(env.VERCEL_PROJECT_ID || "").trim();
  const actionsPush = env.GITHUB_ACTIONS === "true" && env.GITHUB_EVENT_NAME === "push";

  if (!hook) {
    if (actionsPush) {
      return {
        ok: true,
        action: "skip",
        message:
          "VERCEL_AVIATORPASS_DEPLOY_HOOK is not set. Vercel Git deploys main. Add the Production environment secret to POST the hook.",
      };
    }
    return { ok: false, action: "fail", message: "VERCEL_AVIATORPASS_DEPLOY_HOOK is not set" };
  }

  let parsed;
  try {
    parsed = new URL(hook);
  } catch {
    return {
      ok: false,
      action: "fail",
      message: "VERCEL_AVIATORPASS_DEPLOY_HOOK is not a valid URL",
    };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, action: "fail", message: "VERCEL_AVIATORPASS_DEPLOY_HOOK must be https" };
  }
  if (parsed.hostname !== "api.vercel.com") {
    return {
      ok: false,
      action: "fail",
      message: "VERCEL_AVIATORPASS_DEPLOY_HOOK host must be api.vercel.com",
    };
  }
  if (!parsed.pathname.startsWith("/v1/integrations/deploy/")) {
    return {
      ok: false,
      action: "fail",
      message: "VERCEL_AVIATORPASS_DEPLOY_HOOK is not a Vercel deploy hook path",
    };
  }

  const parts = parsed.pathname.replace(/\/$/, "").split("/");
  const hookProjectId = parts[4];
  const hookId = parts[5];
  if (!hookProjectId || !hookId) {
    return {
      ok: false,
      action: "fail",
      message: "VERCEL_AVIATORPASS_DEPLOY_HOOK is missing project or hook id",
    };
  }
  if (expectedProject && hookProjectId !== expectedProject) {
    return {
      ok: false,
      action: "fail",
      message: "VERCEL_AVIATORPASS_DEPLOY_HOOK does not match VERCEL_PROJECT_ID",
    };
  }

  return { ok: true, action: "post", hook, hookProjectId, hookId };
}

const inspected = inspectDeployHook(process.env);
if (inspected.action === "skip") {
  console.log(`SKIP  ${inspected.message}`);
  process.exit(0);
}
if (!inspected.ok || inspected.action !== "post" || !inspected.hook) {
  fail(inspected.message);
}

const hook = inspected.hook;
const hookProjectId = inspected.hookProjectId;
const hookId = inspected.hookId;

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
