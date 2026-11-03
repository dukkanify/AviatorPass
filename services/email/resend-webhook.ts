/**
 * Resend (Svix) webhook signature verification + bounce handling.
 * Does not change Resend API keys or domain DNS — consumes events only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  hasProcessedWebhookEvent,
  markWebhookEventProcessed,
  upsertSuppression,
} from "@/services/email/suppression-store";

export type ResendWebhookResult = {
  processed: boolean;
  duplicate: boolean;
  suppressed: string[];
  eventType: string | null;
  eventId: string | null;
};

function parseWhsec(secret: string): Buffer {
  const raw = secret.trim();
  if (raw.startsWith("whsec_")) {
    return Buffer.from(raw.slice("whsec_".length), "base64");
  }
  return Buffer.from(raw, "utf8");
}

/**
 * Verify Svix-style signatures used by Resend webhooks.
 * @see https://resend.com/docs/dashboard/webhooks/verify-webhook-signatures
 */
export function verifyResendWebhookSignature(input: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
  /** Reject timestamps older than this (ms). Default 5 minutes. */
  toleranceMs?: number;
}): boolean {
  const tolerance = input.toleranceMs ?? 5 * 60_000;
  const ts = Number(input.svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts * 1000) > tolerance) return false;

  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.payload}`;
  const secretBuf = parseWhsec(input.secret);
  const expected = createHmac("sha256", secretBuf).update(signedContent).digest("base64");

  const candidates = input.svixSignature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part));

  for (const candidate of candidates) {
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(candidate);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

function emailsFromPayload(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.includes("@")) out.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.includes("@")) out.push(item);
        if (item && typeof item === "object" && "email" in item) {
          const email = (item as { email?: unknown }).email;
          if (typeof email === "string") out.push(email);
        }
      }
    }
  };
  push(data.to);
  push(data.email);
  if (data.data && typeof data.data === "object") {
    const nested = data.data as Record<string, unknown>;
    push(nested.to);
    push(nested.email);
  }
  return [...new Set(out.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export function processResendWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): ResendWebhookResult {
  const eventId = input.eventId.trim();
  const eventType = input.eventType.trim().toLowerCase();
  if (eventId && hasProcessedWebhookEvent(eventId)) {
    return {
      processed: false,
      duplicate: true,
      suppressed: [],
      eventType,
      eventId,
    };
  }

  const data =
    input.payload.data && typeof input.payload.data === "object"
      ? (input.payload.data as Record<string, unknown>)
      : input.payload;

  const suppressed: string[] = [];
  const isHardBounce =
    eventType.includes("bounce") || eventType === "email.bounced" || eventType.endsWith(".bounced");
  const isComplaint =
    eventType.includes("complained") ||
    eventType.includes("complaint") ||
    eventType === "email.complained";

  if (isHardBounce || isComplaint) {
    for (const email of emailsFromPayload(data)) {
      upsertSuppression({
        email,
        reason: isComplaint ? "complaint" : "hard_bounce",
        source: `resend-webhook:${eventType || "unknown"}`,
        permanent: true,
        resendEventId: eventId || null,
      });
      suppressed.push(email);
    }
  }

  if (eventId) markWebhookEventProcessed(eventId);

  return {
    processed: true,
    duplicate: false,
    suppressed,
    eventType: eventType || null,
    eventId: eventId || null,
  };
}
