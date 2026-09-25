/**
 * Inbound email → AviatorPass conversation.
 * Ready when Resend inbound (or another ESP) posts to /api/webhooks/inbound/email.
 * Human setup: inbound mailbox + webhook secret. Replies are not required for outbound alerts.
 */

import { findUserByEmail } from "@/services/auth/store";
import { toUserProfile } from "@/services/auth/store";
import { getConversation, sendMessage } from "@/services/communication/messaging-service";
import { getPlatformSettings } from "@/services/settings/settings-service";

export class InboundEmailError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "InboundEmailError";
    this.status = status;
  }
}

function listAddresses(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (entry && typeof entry === "object" && "email" in entry) {
        return [String((entry as { email: unknown }).email)];
      }
      return [];
    });
  }
  if (typeof value === "object" && value && "email" in value) {
    return [String((value as { email: unknown }).email)];
  }
  return [];
}

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim().toLowerCase();
}

export function conversationIdFromMailbox(raw: string): string | null {
  const match = raw.match(/(?:messages|msg)\+([a-z0-9_-]+)@/i);
  return match?.[1] ?? null;
}

export function conversationIdFromSubject(subject: string): string | null {
  const match = subject.match(/\[AP-c:([a-z0-9_-]+)\]/i);
  return match?.[1] ?? null;
}

export function stripQuotedReply(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\nOn .+wrote:/i)[0]!
    .split(/-----Original Message-----/i)[0]!
    .split(/\n-- \n/)[0]!
    .trim();
}

function platformMailboxes(): Set<string> {
  const email = getPlatformSettings().email;
  const inbound = process.env.MESSAGE_INBOUND_ADDRESS?.trim().toLowerCase();
  return new Set(
    [email.senderEmail, email.replyToEmail, inbound, "beth.t@example.com"]
      .filter(Boolean)
      .map((value) => extractEmail(String(value))),
  );
}

export async function ingestInboundEmail(input: {
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
}): Promise<{
  accepted: boolean;
  conversationId: string | null;
  messageId: string | null;
  reason?: string;
}> {
  const from = listAddresses(input.from).map(extractEmail)[0] ?? "";
  const targets = [...listAddresses(input.to), ...listAddresses(input.cc)].map(extractEmail);
  if (!from) {
    throw new InboundEmailError("Missing From address");
  }
  if (platformMailboxes().has(from)) {
    return { accepted: false, conversationId: null, messageId: null, reason: "loop" };
  }

  const subject = String(input.subject ?? "");
  const conversationId =
    targets.map(conversationIdFromMailbox).find(Boolean) ?? conversationIdFromSubject(subject);
  if (!conversationId) {
    return { accepted: false, conversationId: null, messageId: null, reason: "no_conversation" };
  }

  const conversation = getConversation(conversationId);
  if (!conversation || conversation.deletedAt) {
    return { accepted: false, conversationId, messageId: null, reason: "unknown_conversation" };
  }

  const user = findUserByEmail(from);
  if (!user) {
    return { accepted: false, conversationId, messageId: null, reason: "unknown_sender" };
  }
  if (!conversation.participantIds.includes(user.id)) {
    return { accepted: false, conversationId, messageId: null, reason: "not_participant" };
  }

  const text = stripQuotedReply(
    String(input.text ?? "").trim() || String(input.html ?? "").replace(/<[^>]+>/g, " "),
  );
  if (!text) {
    return { accepted: false, conversationId, messageId: null, reason: "empty_body" };
  }

  const message = await sendMessage({
    user: toUserProfile(user),
    conversationId,
    body: text.slice(0, 4000),
  });
  return { accepted: true, conversationId, messageId: message.id };
}

export function inboundEmailEnabled() {
  return Boolean(
    process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ||
    process.env.MESSAGE_INBOUND_ADDRESS?.trim(),
  );
}
