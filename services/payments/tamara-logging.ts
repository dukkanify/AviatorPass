/**
 * Structured Tamara logs. API tokens, notification tokens, and JWTs are never written.
 */

import { writeOpsLog } from "@/services/ops/logging-service";

const BLOCKED = new Set([
  "secret",
  "token",
  "apiToken",
  "notificationToken",
  "authorization",
  "password",
  "tamaraToken",
  "TAMARA_API_TOKEN",
  "TAMARA_NOTIFICATION_TOKEN",
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

export function logTamaraEvent(input: {
  level?: "info" | "warn" | "error";
  message: string;
  path?: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  writeOpsLog({
    level: input.level ?? "info",
    category: "application",
    message: `[tamara] ${input.message}`.slice(0, 2000),
    details: sanitize(input.details),
    path: input.path ?? "/api/payments/tamara/webhook",
    userId: input.userId ?? null,
  });
}
