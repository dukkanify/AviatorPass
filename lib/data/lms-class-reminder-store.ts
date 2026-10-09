/**
 * Indexed class reminder queue — never hydrate 37k rows with the live-class catalog.
 *
 * Production: Postgres `aep_lms_class_reminders` keyed by live_class_id / status.
 * Local / tests: `.data/aep-class-reminders.json` with in-memory indexes.
 * Sent/cancelled/failed rows are capped so the queue cannot grow forever.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { ReminderQueueItem } from "@/types/classes";

const FILE = path.join(dataDir(), "aep-class-reminders.json");
const TABLE = "aep_lms_class_reminders";

/** Lifetime bound for finished reminder history. Pending rows are never trimmed. */
export const CLASS_REMINDER_DONE_CAP = 400;

type ReminderFile = { reminders: ReminderQueueItem[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, ReminderQueueItem>;
  byClass: Map<string, ReminderQueueItem[]>;
  pending: ReminderQueueItem[];
} | null = null;

function emptyFile(): ReminderFile {
  return { reminders: [] };
}

function asReminder(row: unknown): ReminderQueueItem | null {
  if (!row || typeof row !== "object") return null;
  const value = row as ReminderQueueItem;
  if (!value.id || !value.liveClassId || !value.userId || !value.scheduledFor) return null;
  return value;
}

function payloadFromSql(row: { payload?: unknown }): ReminderQueueItem | null {
  return asReminder(row.payload);
}

function ensureSqlTable(): void {
  if (tableReady || !postgresStoreEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_class_reminders_class_idx ON ${TABLE} (live_class_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_class_reminders_due_idx ON ${TABLE} (status, scheduled_for)`,
  );
  tableReady = true;
}

function rebuildFileIndex(rows: ReminderQueueItem[]): void {
  const byId = new Map<string, ReminderQueueItem>();
  const byClass = new Map<string, ReminderQueueItem[]>();
  const pending: ReminderQueueItem[] = [];
  for (const row of rows) {
    byId.set(row.id, row);
    const list = byClass.get(row.liveClassId) ?? [];
    list.push(row);
    byClass.set(row.liveClassId, list);
    if (row.status === "pending") pending.push(row);
  }
  fileIndex = { byId, byClass, pending };
}

function readFileRows(): ReminderQueueItem[] {
  const file = readJsonFile<ReminderFile>(FILE, emptyFile);
  const rows = (file.reminders ?? []).map(asReminder).filter(Boolean) as ReminderQueueItem[];
  if (!fileIndex) rebuildFileIndex(rows);
  return rows;
}

function ensureFileIndex(): NonNullable<typeof fileIndex> {
  if (fileIndex) return fileIndex;
  readFileRows();
  return fileIndex!;
}

function writeFileRows(rows: ReminderQueueItem[]): void {
  rebuildFileIndex(rows);
  writeJsonFile(FILE, { reminders: rows });
}

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function isDone(status: ReminderQueueItem["status"]): boolean {
  return status === "sent" || status === "cancelled" || status === "failed";
}

export function trimDoneReminders(rows: ReminderQueueItem[]): ReminderQueueItem[] {
  const pending: ReminderQueueItem[] = [];
  const done: ReminderQueueItem[] = [];
  for (const row of rows) {
    if (isDone(row.status)) done.push(row);
    else pending.push(row);
  }
  if (done.length <= CLASS_REMINDER_DONE_CAP) return rows;
  done.sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  return [...pending, ...done.slice(0, CLASS_REMINDER_DONE_CAP)];
}

export function listRemindersForClass(liveClassId: string): ReminderQueueItem[] {
  if (!liveClassId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE live_class_id = $1`, [
      liveClassId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as ReminderQueueItem[];
  }
  return [...(ensureFileIndex().byClass.get(liveClassId) ?? [])];
}

export function listDueReminders(nowIso = new Date().toISOString()): ReminderQueueItem[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${TABLE}
       WHERE status = 'pending' AND scheduled_for <= $1`,
      [nowIso],
    )
      .map(payloadFromSql)
      .filter(Boolean) as ReminderQueueItem[];
  }
  const now = Date.parse(nowIso);
  return ensureFileIndex().pending.filter((row) => Date.parse(row.scheduledFor) <= now);
}

export function listAllReminders(): ReminderQueueItem[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map(payloadFromSql)
      .filter(Boolean) as ReminderQueueItem[];
  }
  return [...readFileRows()];
}

export function upsertReminder(item: ReminderQueueItem): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, live_class_id, user_id, status, scheduled_for, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         live_class_id = EXCLUDED.live_class_id,
         user_id = EXCLUDED.user_id,
         status = EXCLUDED.status,
         scheduled_for = EXCLUDED.scheduled_for,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        item.id,
        item.liveClassId,
        item.userId,
        item.status,
        item.scheduledFor,
        JSON.stringify(item),
      ],
    );
    return;
  }
  const rows = readFileRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writeFileRows(trimDoneReminders(rows));
}

export function replaceAllReminders(rows: ReminderQueueItem[]): void {
  const unique = new Map<string, ReminderQueueItem>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = trimDoneReminders([...unique.values()]);
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(`DELETE FROM ${TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 6;
        values.push(
          row.id,
          row.liveClassId,
          row.userId,
          row.status,
          row.scheduledFor,
          JSON.stringify(row),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, live_class_id, user_id, status, scheduled_for, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           live_class_id = EXCLUDED.live_class_id,
           user_id = EXCLUDED.user_id,
           status = EXCLUDED.status,
           scheduled_for = EXCLUDED.scheduled_for,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeFileRows(next);
}

export function replacePendingForClass(
  liveClassId: string,
  nextPending: ReminderQueueItem[],
): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(`DELETE FROM ${TABLE} WHERE live_class_id = $1 AND status = 'pending'`, [liveClassId]);
    for (const item of nextPending) upsertReminder(item);
    return;
  }
  const kept = readFileRows().filter(
    (row) => !(row.liveClassId === liveClassId && row.status === "pending"),
  );
  writeFileRows(trimDoneReminders([...kept, ...nextPending]));
}

export function cancelPendingForClass(liveClassId: string): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    const pending = listRemindersForClass(liveClassId).filter((row) => row.status === "pending");
    for (const row of pending) {
      upsertReminder({ ...row, status: "cancelled" });
    }
    return;
  }
  const rows = readFileRows().map((row) =>
    row.liveClassId === liveClassId && row.status === "pending"
      ? { ...row, status: "cancelled" as const }
      : row,
  );
  writeFileRows(trimDoneReminders(rows));
}

/** Tests only. */
export function resetClassReminderStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
