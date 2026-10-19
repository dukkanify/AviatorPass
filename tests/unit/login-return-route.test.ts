/**
 * Password login must forward the validated return path to the session redirect.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const passwordLogin = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "csrf-token" }),
    set: () => undefined,
  }),
}));

vi.mock("@/lib/security/api-guard", () => ({
  enforceMutatingApiSecurity: async () => null,
}));

vi.mock("@/services/auth/auth-service", () => ({
  passwordLogin: (...args: unknown[]) => passwordLogin(...args),
}));

vi.mock("@/services/ops/logging-service", () => ({
  writeOpsLog: () => undefined,
}));

import { POST } from "@/app/api/auth/login/route";

beforeEach(() => {
  passwordLogin.mockReset();
  passwordLogin.mockResolvedValue({
    success: true,
    data: {
      user: { id: "inst-1", role: "instructor" },
      redirectTo: "/instructor/profile",
      requiresProfile: false,
      mustChangePassword: false,
    },
    error: null,
  });
});

describe("POST /api/auth/login return path", () => {
  it("passes returnTo through so instructors can land on /instructor/profile", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "instructor@aviatorpass.com",
          password: "DemoPass123!",
          rememberMe: false,
          returnTo: "/instructor/profile",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(passwordLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "instructor@aviatorpass.com",
        returnTo: "/instructor/profile",
      }),
    );
    const body = (await response.json()) as { data: { redirectTo: string } };
    expect(body.data.redirectTo).toBe("/instructor/profile");
  });

  it("keeps a normal login when no return path is sent", async () => {
    passwordLogin.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: "inst-1", role: "instructor" },
        redirectTo: "/instructor/dashboard",
        requiresProfile: false,
        mustChangePassword: false,
      },
      error: null,
    });

    await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "instructor@aviatorpass.com",
          password: "DemoPass123!",
        }),
      }),
    );

    expect(passwordLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        returnTo: undefined,
      }),
    );
  });
});
