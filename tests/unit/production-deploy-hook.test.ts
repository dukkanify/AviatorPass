import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inspectDeployHook } from "@/lib/ops/production-deploy-hook";

const VALID = "https://api.vercel.com/v1/integrations/deploy/prj_exampleAviatorPass/HkValidExample";

describe("production deploy hook", () => {
  it("skips a missing hook on GitHub Actions push so Vercel Git can deploy main", () => {
    const result = inspectDeployHook({
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
    });
    expect(result).toMatchObject({ ok: true, action: "skip" });
    expect(result.message).toMatch(/Vercel Git deploys main/);
  });

  it("fails when the hook is missing locally or on workflow_dispatch", () => {
    expect(inspectDeployHook({}).action).toBe("fail");
    expect(
      inspectDeployHook({
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "workflow_dispatch",
      }).action,
    ).toBe("fail");
  });

  it("rejects invalid hook URLs without posting", () => {
    expect(inspectDeployHook({ VERCEL_AVIATORPASS_DEPLOY_HOOK: "not-a-url" }).message).toMatch(
      /valid URL/,
    );
    expect(
      inspectDeployHook({
        VERCEL_AVIATORPASS_DEPLOY_HOOK: "http://api.vercel.com/v1/integrations/deploy/p/h",
      }).message,
    ).toMatch(/must be https/);
    expect(
      inspectDeployHook({
        VERCEL_AVIATORPASS_DEPLOY_HOOK: "https://example.com/v1/integrations/deploy/p/h",
      }).message,
    ).toMatch(/api.vercel.com/);
  });

  it("accepts a current Vercel production hook path", () => {
    const result = inspectDeployHook({ VERCEL_AVIATORPASS_DEPLOY_HOOK: VALID });
    expect(result.action).toBe("post");
    expect(result.hookProjectId).toBe("prj_exampleAviatorPass");
    expect(result.hookId).toBe("HkValidExample");
  });

  it("fails a local deploy:production command when the secret is unset", () => {
    const script = path.join(process.cwd(), "scripts/trigger-production-deploy.mjs");
    const ran = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        VERCEL_AVIATORPASS_DEPLOY_HOOK: "",
        GITHUB_ACTIONS: "",
        GITHUB_EVENT_NAME: "",
      },
      encoding: "utf8",
    });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toMatch(/VERCEL_AVIATORPASS_DEPLOY_HOOK is not set/);
  });

  it("exits 0 with SKIP on a GitHub Actions push without the secret", () => {
    const script = path.join(process.cwd(), "scripts/trigger-production-deploy.mjs");
    const ran = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        VERCEL_AVIATORPASS_DEPLOY_HOOK: "",
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "push",
      },
      encoding: "utf8",
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/^SKIP /);
  });
});
