/**
 * Email suppression list — hard bounces, complaints, and confirmed undeliverable
 * demo mailboxes. Real student test addresses (e.g. Gmail QA) are never blocked
 * just because they are “test” accounts.
 */

import path from "path";

import { DEMO_ACCOUNTS, isDemoAccountEmail } from "@/constants/demo-accounts";
import { generateId } from "@/lib/security/crypto";
import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";

export type SuppressionReason = "hard_bounce" | "complaint" | "manual" | "confirmed_demo_mailbox";

export type SuppressionEntry = {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string;
  permanent: boolean;
  resendEventId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type SuppressionDb = {
  entries: SuppressionEntry[];
  /** Processed Resend/Svix event ids — webhook idempotency. */
  processedEventIds: string[];
};

const DATA_FILE = path.join(dataDir(), "aep-email-suppressions.json");
let demoMailboxSeeded = false;

function emptyDb(): SuppressionDb {
  return { entries: [], processedEventIds: [] };
}

function readDb(): SuppressionDb {
  const db = readJsonFile<SuppressionDb>(DATA_FILE, emptyDb);
  return {
    entries: Array.isArray(db.entries) ? db.entries : [],
    processedEventIds: Array.isArray(db.processedEventIds) ? db.processedEventIds : [],
  };
}

function writeDb(db: SuppressionDb) {
  writeJsonFile(DATA_FILE, {
    entries: db.entries.slice(0, 5_000),
    processedEventIds: db.processedEventIds.slice(0, 10_000),
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Seed confirmed undeliverable demo catalog addresses (not real inboxes). */
export function ensureDemoMailboxSuppressions(): void {
  if (demoMailboxSeeded) return;
  const db = readDb();
  let changed = false;
  const now = new Date().toISOString();
  for (const account of DEMO_ACCOUNTS) {
    const email = normalizeEmail(account.email);
    if (db.entries.some((row) => row.email === email && row.reason === "confirmed_demo_mailbox")) {
      continue;
    }
    db.entries.push({
      id: generateId(),
      email,
      reason: "confirmed_demo_mailbox",
      source: "demo-accounts-catalog",
      permanent: true,
      resendEventId: null,
      createdAt: now,
      updatedAt: now,
    });
    changed = true;
  }
  if (changed) writeDb(db);
  demoMailboxSeeded = true;
}

export function listSuppressions(limit = 200): SuppressionEntry[] {
  ensureDemoMailboxSuppressions();
  return readDb().entries.slice(0, limit);
}

export function findSuppression(email: string): SuppressionEntry | null {
  ensureDemoMailboxSuppressions();
  const key = normalizeEmail(email);
  if (!key) return null;
  return readDb().entries.find((row) => row.email === key) ?? null;
}

/**
 * OTP / password-reset may still target a real inbox even if a soft rule exists.
 * Permanent hard_bounce / complaint / confirmed_demo always block Resend.
 */
export function isEmailSuppressed(
  email: string,
  options?: { allowTransactionalToDemo?: boolean },
): { suppressed: boolean; entry: SuppressionEntry | null; reason: string | null } {
  const entry = findSuppression(email);
  if (!entry) return { suppressed: false, entry: null, reason: null };
  if (
    options?.allowTransactionalToDemo &&
    entry.reason === "confirmed_demo_mailbox" &&
    isDemoAccountEmail(email)
  ) {
    // Demo OTP short-circuits elsewhere; still block Resend to undeliverable demos.
    return {
      suppressed: true,
      entry,
      reason: "Confirmed demo mailbox — not a real inbox",
    };
  }
  return {
    suppressed: true,
    entry,
    reason: `Suppressed (${entry.reason})`,
  };
}

export function upsertSuppression(input: {
  email: string;
  reason: SuppressionReason;
  source: string;
  permanent?: boolean;
  resendEventId?: string | null;
}): SuppressionEntry {
  const email = normalizeEmail(input.email);
  const db = readDb();
  const now = new Date().toISOString();
  const existing = db.entries.find((row) => row.email === email);
  if (existing) {
    existing.reason = input.reason;
    existing.source = input.source;
    existing.permanent = input.permanent ?? true;
    existing.resendEventId = input.resendEventId ?? existing.resendEventId ?? null;
    existing.updatedAt = now;
    writeDb(db);
    return existing;
  }
  const entry: SuppressionEntry = {
    id: generateId(),
    email,
    reason: input.reason,
    source: input.source,
    permanent: input.permanent ?? true,
    resendEventId: input.resendEventId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.entries.unshift(entry);
  writeDb(db);
  return entry;
}

export function removeSuppression(email: string): boolean {
  const key = normalizeEmail(email);
  const db = readDb();
  const before = db.entries.length;
  db.entries = db.entries.filter(
    (row) => !(row.email === key && row.reason !== "confirmed_demo_mailbox"),
  );
  writeDb(db);
  return db.entries.length < before;
}

/** Returns true if this webhook event id was already processed. */
export function hasProcessedWebhookEvent(eventId: string): boolean {
  const id = eventId.trim();
  if (!id) return false;
  return readDb().processedEventIds.includes(id);
}

export function markWebhookEventProcessed(eventId: string): void {
  const id = eventId.trim();
  if (!id) return;
  const db = readDb();
  if (db.processedEventIds.includes(id)) return;
  db.processedEventIds.unshift(id);
  writeDb(db);
}

/** Test helper — clears suppressions and processed webhook ids. */
export function resetEmailSuppressionStoreForTests(): void {
  demoMailboxSeeded = false;
  writeDb(emptyDb());
}
