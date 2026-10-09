/**
 * Indexed in-app notifications — never hydrate 11k inbox rows with the auth blob.
 *
 * Production: Postgres `aep_auth_notifications` keyed by user_id / status.
 * Local / tests: `.data/aep-notifications.json` with in-memory indexes.
 * Read/archived/deleted history is capped per user; unread rows are never trimmed.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { NotificationRecord } from "@/types";

const FILE = path.join(dataDir(), "aep-notifications.json");
const TABLE = "aep_auth_notifications";

/** Lifetime bound for read/archived/deleted history per user. Unread is never trimmed. */
export const AUTH_NOTIFICATION_CAP = 400;

type NotificationFile = { notifications: NotificationRecord[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, NotificationRecord>;
  byUser: Map<string, NotificationRecord[]>;
} | null = null;

function emptyFile(): NotificationFile {
  return { notifications: [] };
}

function asNotification(row: unknown): NotificationRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as NotificationRecord;
  if (!value.id || !value.userId || !value.createdAt) return null;
  return value;
}

function payloadFromSql(row: { payload?: unknown }): NotificationRecord | null {
  return asNotification(row.payload);
}

export function notificationRowStatus(
  row: NotificationRecord,
): NonNullable<NotificationRecord["status"]> {
  if (row.deletedAt || row.status === "deleted") return "deleted";
  if (row.archivedAt || row.status === "archived") return "archived";
  if (row.readAt || row.status === "read") return "read";
  return "unread";
}

function isActiveUnread(row: NotificationRecord): boolean {
  return notificationRowStatus(row) === "unread";
}

function ensureSqlTable(): void {
  if (tableReady || !postgresStoreEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_auth_notifications_user_idx ON ${TABLE} (user_id)`);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_auth_notifications_unread_idx ON ${TABLE} (user_id, status)`,
  );
  tableReady = true;
}

function rebuildFileIndex(rows: NotificationRecord[]): void {
  const byId = new Map<string, NotificationRecord>();
  const byUser = new Map<string, NotificationRecord[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  fileIndex = { byId, byUser };
}

function readFileRows(): NotificationRecord[] {
  const file = readJsonFile<NotificationFile>(FILE, emptyFile);
  const rows = (file.notifications ?? [])
    .map(asNotification)
    .filter(Boolean) as NotificationRecord[];
  if (!fileIndex) rebuildFileIndex(rows);
  return rows;
}

function ensureFileIndex(): NonNullable<typeof fileIndex> {
  if (fileIndex) return fileIndex;
  readFileRows();
  return fileIndex!;
}

function writeFileRows(rows: NotificationRecord[]): void {
  rebuildFileIndex(rows);
  writeJsonFile(FILE, { notifications: rows });
}

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

export function trimNotifications(rows: NotificationRecord[]): NotificationRecord[] {
  const byUser = new Map<string, NotificationRecord[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  const out: NotificationRecord[] = [];
  for (const list of byUser.values()) {
    const unread: NotificationRecord[] = [];
    const done: NotificationRecord[] = [];
    for (const row of list) {
      if (isActiveUnread(row)) unread.push(row);
      else done.push(row);
    }
    done.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const keepDone = Math.max(0, AUTH_NOTIFICATION_CAP - unread.length);
    out.push(...unread, ...done.slice(0, keepDone));
  }
  return out;
}

function trimUserInSql(userId: string): void {
  const rows = listNotificationsForUser(userId);
  const trimmed = trimNotifications(rows);
  if (trimmed.length === rows.length) return;
  const keep = new Set(trimmed.map((row) => row.id));
  for (const row of rows) {
    if (!keep.has(row.id)) {
      neonSql(`DELETE FROM ${TABLE} WHERE id = $1`, [row.id]);
    }
  }
}

export function listNotificationsForUser(userId: string): NotificationRecord[] {
  if (!userId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE user_id = $1`, [
      userId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as NotificationRecord[];
  }
  return [...(ensureFileIndex().byUser.get(userId) ?? [])];
}

export function getNotificationById(id: string): NotificationRecord | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE id = $1`, [id]);
    return payloadFromSql(rows[0] ?? {}) ?? null;
  }
  return ensureFileIndex().byId.get(id) ?? null;
}

export function countUnreadForUser(userId: string): number {
  if (!userId) return 0;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ n: number | string }>(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE user_id = $1 AND status = 'unread'`,
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  }
  return (ensureFileIndex().byUser.get(userId) ?? []).filter(isActiveUnread).length;
}

export function countUnreadNotifications(): number {
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ n: number | string }>(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE status = 'unread'`,
    );
    return Number(rows[0]?.n ?? 0);
  }
  let total = 0;
  for (const row of ensureFileIndex().byId.values()) {
    if (isActiveUnread(row)) total += 1;
  }
  return total;
}

export function listAllNotifications(): NotificationRecord[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map(payloadFromSql)
      .filter(Boolean) as NotificationRecord[];
  }
  return [...readFileRows()];
}

export function upsertNotification(item: NotificationRecord): void {
  const status = notificationRowStatus(item);
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, user_id, status, created_at, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.userId, status, item.createdAt, JSON.stringify(item)],
    );
    trimUserInSql(item.userId);
    return;
  }
  const rows = readFileRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeFileRows(trimNotifications(rows));
}

export function replaceAllNotifications(rows: NotificationRecord[]): void {
  const unique = new Map<string, NotificationRecord>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = trimNotifications([...unique.values()]);
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(`DELETE FROM ${TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 5;
        values.push(
          row.id,
          row.userId,
          notificationRowStatus(row),
          row.createdAt,
          JSON.stringify(row),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, user_id, status, created_at, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeFileRows(next);
}

/** Tests only. */
export function resetNotificationStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
