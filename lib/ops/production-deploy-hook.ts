/**
 * Decide whether to POST the AviatorPass production deploy hook.
 * Never logs the hook URL.
 */

export type DeployHookDecision = {
  ok: boolean;
  action: "post" | "skip" | "fail";
  message: string;
  hook?: string;
  hookProjectId?: string;
  hookId?: string;
};

function fail(message: string): DeployHookDecision {
  return { ok: false, action: "fail", message };
}

export function inspectDeployHook(
  env: Record<string, string | undefined> = process.env,
): DeployHookDecision {
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

  let parsed: URL;
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
