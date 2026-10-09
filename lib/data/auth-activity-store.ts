/**
 * Indexed activity and audit logs — never hydrate the leftover auth catalog
 * to write a login event or render the recent-activity widget.
 *
 * Production: Postgres `aep_auth_activity_logs` / `aep_auth_audit_logs`.
 * Local / tests: `.data/aep-activity-logs.json` and `.data/aep-audit-logs.json`.
 * Newest 400 rows are kept. Older rows are dropped.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { ActivityLogRecord, AuditLogRecord } from "@/types";

const ACTIVITY_FILE = path.join(dataDir(), "aep-activity-logs.json");
const AUDIT_FILE = path.join(dataDir(), "aep-audit-logs.json");
const ACTIVITY_TABLE = "aep_auth_activity_logs";
const AUDIT_TABLE = "aep_auth_audit_logs";

/** Lifetime bound so activity/audit history cannot inflate the auth store. */
export const AUTH_LOG_CAP = 400;

type ActivityFile = { activityLogs: ActivityLogRecord[] };
type AuditFile = { auditLogs: AuditLogRecord[] };

let tablesReady = false;
let activityIndex: {
  byId: Map<string, ActivityLogRecord>;
  byActor: Map<string, ActivityLogRecord[]>;
} | null = null;
let auditIndex: { byId: Map<string, AuditLogRecord> } | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asActivity(row: unknown): ActivityLogRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as ActivityLogRecord;
  if (!value.id || !value.createdAt || !value.action) return null;
  return value;
}

function asAudit(row: unknown): AuditLogRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as AuditLogRecord;
  if (!value.id || !value.createdAt || !value.action) return null;
  return value;
}

function ensureSqlTables(): void {
  if (tablesReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${ACTIVITY_TABLE} (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_auth_activity_actor_idx ON ${ACTIVITY_TABLE} (actor_id)`);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_auth_activity_created_idx ON ${ACTIVITY_TABLE} (created_at DESC)`,
  );
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_auth_audit_created_idx ON ${AUDIT_TABLE} (created_at DESC)`,
  );
  tablesReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildActivity(rows: ActivityLogRecord[]): void {
  const byId = new Map<string, ActivityLogRecord>();
  const byActor = new Map<string, ActivityLogRecord[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.actorId) pushMap(byActor, row.actorId, row);
  }
  activityIndex = { byId, byActor };
}

function rebuildAudit(rows: AuditLogRecord[]): void {
  const byId = new Map<string, AuditLogRecord>();
  for (const row of rows) byId.set(row.id, row);
  auditIndex = { byId };
}

function readActivityRows(): ActivityLogRecord[] {
  const file = readJsonFile<ActivityFile>(ACTIVITY_FILE, () => ({ activityLogs: [] }));
  const rows = (file.activityLogs ?? []).map(asActivity).filter(Boolean) as ActivityLogRecord[];
  if (!activityIndex) rebuildActivity(rows);
  return rows;
}

function readAuditRows(): AuditLogRecord[] {
  const file = readJsonFile<AuditFile>(AUDIT_FILE, () => ({ auditLogs: [] }));
  const rows = (file.auditLogs ?? []).map(asAudit).filter(Boolean) as AuditLogRecord[];
  if (!auditIndex) rebuildAudit(rows);
  return rows;
}

function writeActivityRows(rows: ActivityLogRecord[]): void {
  const next = rows.slice(0, AUTH_LOG_CAP);
  rebuildActivity(next);
  writeJsonFile(ACTIVITY_FILE, { activityLogs: next });
}

function writeAuditRows(rows: AuditLogRecord[]): void {
  const next = rows.slice(0, AUTH_LOG_CAP);
  rebuildAudit(next);
  writeJsonFile(AUDIT_FILE, { auditLogs: next });
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  return [...unique.values()];
}

function newestFirst<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function trimSql(table: string): void {
  neonSql(
    `DELETE FROM ${table}
     WHERE id IN (
       SELECT id FROM ${table}
       ORDER BY created_at ASC, id ASC
       OFFSET $1
     )`,
    [AUTH_LOG_CAP],
  );
}

export function listAllActivityLogs(): ActivityLogRecord[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${ACTIVITY_TABLE} ORDER BY created_at DESC, id DESC`,
    )
      .map((row) => asActivity(row.payload))
      .filter(Boolean) as ActivityLogRecord[];
  }
  return [...readActivityRows()];
}

export function listActivityForActor(actorId: string): ActivityLogRecord[] {
  if (!actorId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${ACTIVITY_TABLE}
       WHERE actor_id = $1
       ORDER BY created_at DESC, id DESC`,
      [actorId],
    )
      .map((row) => asActivity(row.payload))
      .filter(Boolean) as ActivityLogRecord[];
  }
  if (!activityIndex) readActivityRows();
  return [...(activityIndex!.byActor.get(actorId) ?? [])];
}

export function listRecentActivityLogs(limit = 8): ActivityLogRecord[] {
  return listAllActivityLogs().slice(0, Math.max(0, limit));
}

export function listAllAuditLogs(): AuditLogRecord[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${AUDIT_TABLE} ORDER BY created_at DESC, id DESC`,
    )
      .map((row) => asAudit(row.payload))
      .filter(Boolean) as AuditLogRecord[];
  }
  return [...readAuditRows()];
}

export function prependActivityLog(item: ActivityLogRecord): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${ACTIVITY_TABLE} (id, actor_id, action, created_at, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         actor_id = EXCLUDED.actor_id,
         action = EXCLUDED.action,
         created_at = EXCLUDED.created_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.actorId, item.action, item.createdAt, JSON.stringify(item)],
    );
    trimSql(ACTIVITY_TABLE);
    return;
  }
  writeActivityRows([item, ...readActivityRows().filter((row) => row.id !== item.id)]);
}

export function prependAuditLog(item: AuditLogRecord): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${AUDIT_TABLE} (id, actor_id, action, created_at, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         actor_id = EXCLUDED.actor_id,
         action = EXCLUDED.action,
         created_at = EXCLUDED.created_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.actorId, item.action, item.createdAt, JSON.stringify(item)],
    );
    trimSql(AUDIT_TABLE);
    return;
  }
  writeAuditRows([item, ...readAuditRows().filter((row) => row.id !== item.id)]);
}

export function replaceAllActivityLogs(rows: ActivityLogRecord[]): void {
  const next = newestFirst(
    uniqueById(rows.map(asActivity).filter(Boolean) as ActivityLogRecord[]),
  ).slice(0, AUTH_LOG_CAP);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${ACTIVITY_TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 5;
        values.push(row.id, row.actorId, row.action, row.createdAt, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${ACTIVITY_TABLE} (id, actor_id, action, created_at, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           actor_id = EXCLUDED.actor_id,
           action = EXCLUDED.action,
           created_at = EXCLUDED.created_at,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeActivityRows(next);
}

export function replaceAllAuditLogs(rows: AuditLogRecord[]): void {
  const next = newestFirst(uniqueById(rows.map(asAudit).filter(Boolean) as AuditLogRecord[])).slice(
    0,
    AUTH_LOG_CAP,
  );
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${AUDIT_TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 5;
        values.push(row.id, row.actorId, row.action, row.createdAt, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${AUDIT_TABLE} (id, actor_id, action, created_at, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           actor_id = EXCLUDED.actor_id,
           action = EXCLUDED.action,
           created_at = EXCLUDED.created_at,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeAuditRows(next);
}

/** Tests only. */
export function resetAuthActivityStoreRuntime(): void {
  tablesReady = false;
  activityIndex = null;
  auditIndex = null;
}
