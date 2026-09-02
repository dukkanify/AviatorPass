/**
 * One-time password setup tokens emailed after purchase-first enrollment.
 * High-entropy URL tokens — not 6-digit OTPs.
 */

import {
  generateId,
  generateToken,
  hashOtp,
  hashPassword,
  constantTimeEqual,
} from "@/lib/security/crypto";
import { getServerEnv } from "@/config/env";
import { routes } from "@/constants/routes";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity, logAudit } from "@/services/auth/activity-log";
import {
  findUserByEmail,
  findUserById,
  writeAuthDb,
  type PasswordSetupToken,
} from "@/services/auth/store";
import { passwordSchema } from "@/utils/validation";
import { sanitizeEmail } from "@/utils/sanitize";
import { publicAppOrigin } from "@/lib/site-origin";
import type { ApiResponse } from "@/types";

const SETUP_TTL_MS = 48 * 60 * 60_000;

function nowIso() {
  return new Date().toISOString();
}

function appOrigin(): string {
  return publicAppOrigin();
}

function hashSetupToken(token: string): string {
  return hashOtp(token, getServerEnv().AUTH_SECRET);
}

export function passwordSetupUrl(email: string, token: string): string {
  const params = new URLSearchParams({ email, token });
  return `${appOrigin()}${routes.setupPassword}?${params.toString()}`;
}

export function issuePasswordSetupToken(userId: string): {
  token: string;
  url: string;
  expiresAt: string;
} {
  const user = findUserById(userId);
  if (!user) {
    throw new Error("Cannot issue password setup token for unknown user");
  }
  const token = generateToken(32);
  const stamp = nowIso();
  const expiresAt = new Date(Date.now() + SETUP_TTL_MS).toISOString();
  const record: PasswordSetupToken = {
    id: generateId(),
    userId: user.id,
    email: user.email,
    tokenHash: hashSetupToken(token),
    expiresAt,
    consumedAt: null,
    createdAt: stamp,
  };
  writeAuthDb((db) => {
    db.passwordSetupTokens = db.passwordSetupTokens.filter(
      (t) => t.userId !== user.id || t.consumedAt,
    );
    db.passwordSetupTokens.unshift(record);
    if (db.passwordSetupTokens.length > 2000) {
      db.passwordSetupTokens = db.passwordSetupTokens.slice(0, 2000);
    }
  });
  return { token, url: passwordSetupUrl(user.email, token), expiresAt };
}

export async function consumePasswordSetupToken(input: {
  email: string;
  token: string;
  password: string;
}): Promise<ApiResponse<{ email: string }>> {
  const email = sanitizeEmail(input.email);
  const parsed = passwordSchema.safeParse(input.password);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: parsed.error.issues[0]?.message ?? "Invalid password",
    };
  }

  const hashed = hashSetupToken(input.token);
  const user = findUserByEmail(email);
  if (!user) {
    return { success: false, data: null, error: "This setup link is invalid or has expired." };
  }

  let matched: PasswordSetupToken | null = null;
  writeAuthDb((db) => {
    const candidate = db.passwordSetupTokens.find(
      (t) =>
        t.userId === user.id &&
        !t.consumedAt &&
        new Date(t.expiresAt).getTime() > Date.now() &&
        constantTimeEqual(t.tokenHash, hashed),
    );
    if (!candidate) return;
    candidate.consumedAt = nowIso();
    matched = candidate;
  });

  if (!matched) {
    return { success: false, data: null, error: "This setup link is invalid or has expired." };
  }

  const { hash, salt } = hashPassword(parsed.data);
  writeAuthDb((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (!u) return;
    u.passwordHash = hash;
    u.passwordSalt = salt;
    u.mustChangePassword = false;
    u.emailVerified = true;
    u.updatedAt = nowIso();
    d.sessions.forEach((s) => {
      if (s.userId === user.id && !s.revokedAt) s.revokedAt = nowIso();
    });
  });

  await logActivity({
    actorId: user.id,
    action: ACTIVITY_ACTIONS.PASSWORD_RESET,
    entityType: "user",
    entityId: user.id,
    metadata: { via: "purchase_first_setup" },
  });
  await logAudit({
    actorId: user.id,
    action: "auth.password_setup_completed",
    resource: `user:${user.id}`,
    afterState: { email: user.email, via: "purchase_first" },
  });

  return { success: true, data: { email: user.email }, error: null };
}
