/**
 * Structured Stripe logs. Secret keys, webhook secrets, and client secrets are never written.
 */

import { writeOpsLog } from "@/services/ops/logging-service";

const BLOCKED = new Set([
  "secret",
  "secretKey",
  "stripeSecretKey",
  "webhookSecret",
  "signingSecret",
  "clientSecret",
  "client_secret",
  "authorization",
  "password",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

function looksSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^(sk_|rk_|whsec_|pk_live_|pk_test_)/.test(value.trim());
}

function sanitize(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (BLOCKED.has(key) || looksSecret(value)) continue;
    out[key] = value;
  }
  return out;
}

export function logStripeEvent(input: {
  level?: "info" | "warn" | "error";
  message: string;
  path?: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  writeOpsLog({
    level: input.level ?? "info",
    category: "application",
    message: `[stripe] ${input.message}`.slice(0, 2000),
    details: sanitize(input.details),
    path: input.path ?? "/api/payments/webhook",
    userId: input.userId ?? null,
  });
}
