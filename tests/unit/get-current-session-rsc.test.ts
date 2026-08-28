/**
 * Production digest 889204058: getCurrentSession ran from a Server Component
 * and called cookies().set() when the JWT was valid but the isolate had no
 * session row. Next.js forbids cookie writes during RSC render.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import { generateToken, hashValue } from "@/lib/security/crypto";
import { SESSION_COOKIE, signSessionJwt } from "@/lib/security/session-token";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail } from "@/services/auth/store";
import { ROLES } from "@/constants/roles";

const cookieJar = { session: "" as string };
const setCalls: unknown[][] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === SESSION_COOKIE && cookieJar.session) {
        return { value: cookieJar.session };
      }
      return undefined;
    },
    set: (...args: unknown[]) => {
      setCalls.push(args);
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    },
  }),
}));

describe("getCurrentSession in RSC (no cookie writes)", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
  });

  it("resolves a student from a signed JWT even when the session row is missing", async () => {
    const { getCurrentSession } = await import("@/services/auth/auth-service");
    const student = findUserByEmail("student@aviatorpass.com");
    expect(student).toBeTruthy();

    const rawToken = generateToken(24);
    const jwt = await signSessionJwt(
      {
        sid: "missing-on-this-isolate",
        uid: student!.id,
        th: hashValue(rawToken),
        role: ROLES.STUDENT,
        status: student!.status,
        pc: Boolean(student!.profileComplete),
      },
      60 * 60,
    );
    cookieJar.session = `${jwt}.${rawToken}`;
    setCalls.length = 0;

    const result = await getCurrentSession();

    expect(setCalls).toHaveLength(0);
    expect(result.user?.email).toBe("student@aviatorpass.com");
    expect(result.user?.role).toBe(ROLES.STUDENT);
  });
});
