/**
 * Decide whether to POST the AviatorPass production deploy hook.
 * Never logs or returns the hook URL.
 */

function fail(message) {
  return { ok: false, action: "fail", message };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean;
 *   action: "post" | "skip" | "fail";
 *   message: string;
 *   hook?: string;
 *   hookProjectId?: string;
 *   hookId?: string;
 * }}
 */
export function inspectDeployHook(env = process.env) {
  const hook = String(env.VERCEL_AVIATORPASS_DEPLOY_HOOK || "").trim();
  const projectId = String(env.VERCEL_PROJECT_ID || "").trim();
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
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not set");
  }

  let parsed;
  try {
    parsed = new URL(hook);
  } catch {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK must be https");
  }
  if (parsed.hostname !== "api.vercel.com") {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK host must be api.vercel.com");
  }
  if (!parsed.pathname.startsWith("/v1/integrations/deploy/")) {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is not a Vercel deploy hook path");
  }

  const parts = parsed.pathname.replace(/\/$/, "").split("/");
  const hookProjectId = parts[4];
  const hookId = parts[5];
  if (!hookProjectId || !hookId) {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK is missing project or hook id");
  }
  if (projectId && hookProjectId !== projectId) {
    return fail("VERCEL_AVIATORPASS_DEPLOY_HOOK does not match VERCEL_PROJECT_ID");
  }

  return {
    ok: true,
    action: "post",
    message: "POST $VERCEL_AVIATORPASS_DEPLOY_HOOK",
    hook,
    hookProjectId,
    hookId,
  };
}
