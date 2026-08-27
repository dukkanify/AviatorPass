/**
 * Password setup tokens issued after purchase-first enrollment.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  consumePasswordSetupToken,
  issuePasswordSetupToken,
} from "@/services/auth/password-setup-service";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { payGuestCheckout } from "@/services/payments/purchase-first-service";
import { findUserByEmail, readAuthDb } from "@/services/auth/store";
import { passwordLogin } from "@/services/auth/auth-service";
import { generateSecurePassword } from "@/lib/security/crypto";

describe("purchase-first password setup", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("emails a setup link and consumes the token once", async () => {
    const email = `setup.guest.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Setup",
      lastName: "Pilot",
      email,
      phone: "+96550004444",
      country: "KW",
      billingName: "Setup Pilot",
      billingAddress: "Kuwait City",
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `setup-${Date.now()}`,
    });
    expect(result.passwordSetupUrl).toContain("/setup-password");
    expect(result.accountCreated).toBe(true);

    const user = findUserByEmail(email)!;
    const tokenRow = readAuthDb().passwordSetupTokens.find((t) => t.userId === user.id);
    expect(tokenRow).toBeTruthy();

    const issued = issuePasswordSetupToken(user.id);
    const password = generateSecurePassword(16);
    const consumed = await consumePasswordSetupToken({
      email,
      token: issued.token,
      password,
    });
    expect(consumed.success).toBe(true);

    const replay = await consumePasswordSetupToken({
      email,
      token: issued.token,
      password,
    });
    expect(replay.success).toBe(false);

    const signedIn = await passwordLogin({ email, password });
    expect(signedIn.success).toBe(true);
    expect(signedIn.data?.mustChangePassword).toBe(false);
  });
});
