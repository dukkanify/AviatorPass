/**
 * Structured Taly logs. Merchant keys, secrets, tokens, and HMAC signatures are never written.
 */

import { writeOpsLog } from "@/services/ops/logging-service";

const BLOCKED = new Set([
  "secret",
  "token",
  "access_token",
  "accessToken",
  "password",
  "authorization",
  "apiKey",
  "secretKey",
  "webhookSecret",
  "signature",
  "TALY_API_KEY",
  "TALY_SECRET_KEY",
  "TALY_WEBHOOK_SECRET",
]);

function looksSecret(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^(eyJ|sk_|rk_|whsec_)/.test(trimmed) || trimmed.length > 80;
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

export function logTalyEvent(input: {
  level?: "info" | "warn" | "error";
  message: string;
  path?: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  writeOpsLog({
    level: input.level ?? "info",
    category: "application",
    message: `[taly] ${input.message}`.slice(0, 2000),
    details: sanitize(input.details),
    path: input.path ?? "/api/payments/taly/webhook",
    userId: input.userId ?? null,
  });
}
