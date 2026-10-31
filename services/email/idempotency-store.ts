/**
 * Durable email send idempotency — survives retries and concurrent jobs.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";

export type EmailIdempotencyRecord = {
  key: string;
  to: string;
  subject: string;
  outboxId: string | null;
  createdAt: string;
  expiresAt: string;
};

type IdempotencyDb = {
  records: EmailIdempotencyRecord[];
};

const DATA_FILE = path.join(dataDir(), "aep-email-idempotency.json");
/** Default retention: 7 days — long enough for cron retries + duplicate API posts. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60_000;

function emptyDb(): IdempotencyDb {
  return { records: [] };
}

function readDb(): IdempotencyDb {
  const db = readJsonFile<IdempotencyDb>(DATA_FILE, emptyDb);
  const now = Date.now();
  return {
    records: (Array.isArray(db.records) ? db.records : []).filter(
      (row) => Date.parse(row.expiresAt) > now,
    ),
  };
}

function writeDb(db: IdempotencyDb) {
  writeJsonFile(DATA_FILE, { records: db.records.slice(0, 20_000) });
}

export function getEmailIdempotency(key: string): EmailIdempotencyRecord | null {
  const normalized = key.trim();
  if (!normalized) return null;
  return readDb().records.find((row) => row.key === normalized) ?? null;
}

/**
 * Atomically claim a send key. Returns existing record if already claimed
 * (caller must skip send). Returns null when claim succeeds.
 */
export function claimEmailIdempotency(input: {
  key: string;
  to: string;
  subject: string;
  ttlMs?: number;
}): { claimed: true } | { claimed: false; existing: EmailIdempotencyRecord } {
  const key = input.key.trim();
  if (!key) return { claimed: true };
  const db = readDb();
  const existing = db.records.find((row) => row.key === key);
  if (existing) return { claimed: false, existing };
  const now = Date.now();
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  db.records.unshift({
    key,
    to: input.to.trim().toLowerCase(),
    subject: input.subject,
    outboxId: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  });
  writeDb(db);
  return { claimed: true };
}

export function completeEmailIdempotency(key: string, outboxId: string | null): void {
  const normalized = key.trim();
  if (!normalized) return;
  const db = readDb();
  const row = db.records.find((r) => r.key === normalized);
  if (!row) return;
  row.outboxId = outboxId;
  writeDb(db);
}

/** Stable key helpers for schedule / reminder / cancel paths. */
export function scheduleEmailIdempotencyKey(input: {
  event: string;
  liveClassId: string;
  userIdOrEmail: string;
}): string {
  return `schedule:${input.event}:${input.liveClassId}:${input.userIdOrEmail.trim().toLowerCase()}`;
}

export function reminderEmailIdempotencyKey(input: {
  liveClassId: string;
  userId: string;
  kind: string;
}): string {
  return `reminder:${input.liveClassId}:${input.userId}:${input.kind}`;
}

export function otpEmailIdempotencyKey(input: {
  email: string;
  purpose: string;
  challengeId: string;
}): string {
  return `otp:${input.purpose}:${input.email.trim().toLowerCase()}:${input.challengeId}`;
}

/** Test helper — clears durable idempotency records. */
export function resetEmailIdempotencyStoreForTests(): void {
  writeDb(emptyDb());
}
