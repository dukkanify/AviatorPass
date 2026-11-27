import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SESSION_COOKIE, SESSION_HINT_COOKIE } from "@/lib/security/session-token";
import { writeExpiredAuthCookies } from "@/lib/security/cookies";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("super admin logout", () => {
  it("writes expired session and hint cookies onto a response cookie jar", () => {
    const sets: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
    writeExpiredAuthCookies({
      set(name, value, options) {
        sets.push({ name, value, options: options as Record<string, unknown> });
      },
    });
    expect(sets.length).toBeGreaterThanOrEqual(2);
    const session = sets.find((row) => row.name === SESSION_COOKIE);
    const hint = sets.find((row) => row.name === SESSION_HINT_COOKIE);
    expect(session?.value).toBe("");
    expect(hint?.value).toBe("");
    expect(session?.options?.httpOnly).toBe(true);
    expect(hint?.options?.httpOnly).toBe(false);
    expect(session?.options?.maxAge).toBe(0);
    expect(hint?.options?.maxAge).toBe(0);
    expect((session?.options?.expires as Date | undefined)?.getTime()).toBe(0);
  });

  it("expires host-only and Domain=.aviatorpass.com cookies on the logout response", () => {
    const cookies = src("lib/security/cookies.ts");
    const logout = src("app/api/auth/logout/route.ts");
    expect(cookies).toMatch(/expires:\s*new Date\(0\)/);
    expect(cookies).toMatch(/writeExpiredAuthCookies/);
    expect(cookies).toMatch(/applyExpiredAuthCookies/);
    expect(logout).toMatch(/applyExpiredAuthCookies\(NextResponse\.json\(result\)\)/);
  });

  it("revokes the indexed session instead of only the blob overlay", () => {
    const session = src("services/auth/session-service.ts");
    const auth = src("services/auth/auth-service.ts");
    expect(session).toMatch(/getSessionById\(sessionId\)/);
    expect(session).toMatch(/upsertSession\(\{\s*\.\.\.session,\s*revokedAt:/);
    expect(auth).toMatch(/revokeSessionById\(parsed\.payload\.sid\)/);
  });

  it("does not bounce /login?loggedOut=1 back to the dashboard", () => {
    const middleware = src("middleware.ts");
    const login = src("features/auth/components/login-form.tsx");
    const shell = src("components/layout/role-shell.tsx");
    expect(middleware).toMatch(/get\("loggedOut"\) === "1"/);
    expect(middleware).toMatch(/SESSION_HINT_COOKIE/);
    expect(middleware).toMatch(/domain:\s*"\.aviatorpass\.com"/);
    expect(login).toMatch(/loggedOut/);
    expect(login).toMatch(/if \(loggedOut\) return;/);
    expect(shell).toMatch(/\$\{routes\.login\}\?loggedOut=1/);
  });

  it("clears the client signed-in hint so /api/auth/me is not refetched as signed-in", () => {
    const provider = src("providers/auth-provider.tsx");
    expect(provider).toMatch(/function clearSignedInHint/);
    expect(provider).toMatch(/clearSignedInHint\(\)/);
    expect(provider).toMatch(/Domain=\.aviatorpass\.com/);
  });
});
