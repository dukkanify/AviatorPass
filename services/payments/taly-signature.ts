/**
 * Taly webhook HMAC — Taly-Signature header is HMAC-SHA256 hex of concatenated payload values.
 * Docs: https://docs.taly.io/docs/webhook
 */

import { createHmac, timingSafeEqual } from "crypto";

function formatTalyScalar(value: unknown, numberStyle: "raw" | "3dp"): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberStyle === "3dp" ? value.toFixed(3) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function concatenateValues(
  payload: Record<string, unknown>,
  keys: string[],
  numberStyle: "raw" | "3dp",
): string {
  return keys.map((key) => formatTalyScalar(payload[key], numberStyle)).join("&");
}

export function talyCanonicalStrings(payload: Record<string, unknown>): string[] {
  const insertionKeys = Object.keys(payload);
  const sortedKeys = [...insertionKeys].sort((a, b) => a.localeCompare(b));
  const styles: Array<"raw" | "3dp"> = ["raw", "3dp"];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const keys of [sortedKeys, insertionKeys]) {
    for (const style of styles) {
      const canonical = concatenateValues(payload, keys, style);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        out.push(canonical);
      }
    }
  }
  return out;
}

export function computeTalySignature(
  payload: Record<string, unknown>,
  secret: string,
  canonical?: string,
): string {
  const message = canonical ?? talyCanonicalStrings(payload)[0] ?? "";
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

export function extractTalySignature(request: { headers: Headers }): string | null {
  const header =
    request.headers.get("Taly-Signature") ??
    request.headers.get("taly-signature") ??
    request.headers.get("TALY-SIGNATURE");
  const trimmed = header?.trim() ?? "";
  return trimmed || null;
}

function signaturesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase());
  const right = Buffer.from(b.trim().toLowerCase());
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function verifyTalyWebhookSignature(
  payloadText: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(payloadText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    payload = parsed as Record<string, unknown>;
  } catch {
    return false;
  }

  const candidates = talyCanonicalStrings(payload).map((canonical) =>
    computeTalySignature(payload, secret, canonical),
  );
  return candidates.some((candidate) => signaturesEqual(candidate, signature));
}
