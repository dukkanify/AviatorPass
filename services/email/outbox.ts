/**
 * Durable email outbox — every outbound message is recorded for audit / local preview.
 * Uses the shared JSON store so reads stay consistent in-process even when parallel
 * Vitest workers race on the underlying `.data` file.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import { generateId } from "@/lib/security/crypto";

export type EmailDeliveryMode = "smtp" | "resend" | "outbox" | "failed";
export type EmailQueueStatus = "none" | "queued" | "retrying" | "dead";

export interface OutboundEmailRecord {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
  provider: string;
  mode: EmailDeliveryMode;
  error?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
  attempts?: number;
  maxAttempts?: number;
  nextRetryAt?: string | null;
  queueStatus?: EmailQueueStatus;
  updatedAt?: string;
}

interface OutboxDb {
  messages: OutboundEmailRecord[];
}

const DATA_FILE = path.join(dataDir(), "aep-email-outbox.json");
const DEFAULT_MAX_ATTEMPTS = 5;

function emptyOutbox(): OutboxDb {
  return { messages: [] };
}

function readOutbox(): OutboxDb {
  const db = readJsonFile<OutboxDb>(DATA_FILE, emptyOutbox);
  if (!Array.isArray(db.messages)) return emptyOutbox();
  return db;
}

function writeOutbox(db: OutboxDb) {
  writeJsonFile(DATA_FILE, db);
}

export function recordOutboundEmail(
  input: Omit<OutboundEmailRecord, "id" | "createdAt">,
): OutboundEmailRecord {
  const now = new Date().toISOString();
  const record: OutboundEmailRecord = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    attempts: input.attempts ?? 1,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    queueStatus: input.queueStatus ?? "none",
    nextRetryAt: input.nextRetryAt ?? null,
  };
  const db = readOutbox();
  db.messages = [record, ...db.messages.filter((m) => m.id !== record.id)].slice(0, 500);
  writeOutbox(db);
  return record;
}

export function updateOutboundEmail(
  id: string,
  patch: Partial<OutboundEmailRecord>,
): OutboundEmailRecord | null {
  const db = readOutbox();
  const idx = db.messages.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  const next = {
    ...db.messages[idx]!,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  db.messages[idx] = next;
  writeOutbox(db);
  return next;
}

export function listOutboundEmails(limit = 50): OutboundEmailRecord[] {
  return readOutbox().messages.slice(0, limit);
}

export function getOutboundById(id: string): OutboundEmailRecord | null {
  if (!id) return null;
  return readOutbox().messages.find((m) => m.id === id) ?? null;
}

export function getLatestOutboundTo(email: string): OutboundEmailRecord | null {
  const needle = email.trim().toLowerCase();
  return readOutbox().messages.find((m) => m.to.toLowerCase() === needle) ?? null;
}

export function listRetryableOutbound(limit = 20): OutboundEmailRecord[] {
  const now = Date.now();
  return readOutbox()
    .messages.filter((m) => {
      if (m.mode !== "failed") return false;
      if (m.queueStatus === "dead") return false;
      const attempts = m.attempts ?? 1;
      const max = m.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      if (attempts >= max) return false;
      if (m.nextRetryAt && Date.parse(m.nextRetryAt) > now) return false;
      return true;
    })
    .slice(0, limit);
}

export function retryBackoffIso(attempts: number): string {
  const minutes = Math.min(30, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function isRetryableEmailError(error: string | null | undefined): boolean {
  if (!error) return false;
  const text = error.toLowerCase();
  if (text.includes("missing recipient")) return false;
  if (text.includes("disabled in platform settings")) return false;
  return true;
}
