/**
 * Indexed refund requests — never hydrate the payments catalog to find
 * one student refund or the finance queue.
 *
 * Production: Postgres `aep_lms_refunds` keyed by student / status.
 * Local / tests: `.data/aep-refunds.json` with in-memory indexes.
 * These are transactional rows and are never capped.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { RefundRequest } from "@/types/payments";

const FILE = path.join(dataDir(), "aep-refunds.json");
const TABLE = "aep_lms_refunds";

type RefundFile = { refunds: RefundRequest[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, RefundRequest>;
  byStudent: Map<string, RefundRequest[]>;
  byStatus: Map<string, RefundRequest[]>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asRefund(row: unknown): RefundRequest | null {
  if (!row || typeof row !== "object") return null;
  const value = row as RefundRequest;
  if (!value.id || !value.studentId || !value.orderId) return null;
  return value;
}

function ensureSqlTable(): void {
  if (tableReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_refunds_student_idx ON ${TABLE} (student_id)`);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_refunds_status_idx ON ${TABLE} (status)`);
  tableReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildIndex(rows: RefundRequest[]): void {
  const byId = new Map<string, RefundRequest>();
  const byStudent = new Map<string, RefundRequest[]>();
  const byStatus = new Map<string, RefundRequest[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byStudent, row.studentId, row);
    pushMap(byStatus, row.status, row);
  }
  fileIndex = { byId, byStudent, byStatus };
}

function readRows(): RefundRequest[] {
  const file = readJsonFile<RefundFile>(FILE, () => ({ refunds: [] }));
  const rows = (file.refunds ?? []).map(asRefund).filter(Boolean) as RefundRequest[];
  if (!fileIndex) rebuildIndex(rows);
  return rows;
}

function ensureIndex() {
  if (!fileIndex) readRows();
  return fileIndex!;
}

function writeRows(rows: RefundRequest[]): void {
  rebuildIndex(rows);
  writeJsonFile(FILE, { refunds: rows });
}

function uniqueById(rows: RefundRequest[]): RefundRequest[] {
  const unique = new Map<string, RefundRequest>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  return [...unique.values()];
}

export function listRefundsForStudent(studentId: string): RefundRequest[] {
  if (!studentId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE student_id = $1`, [
      studentId,
    ])
      .map((row) => asRefund(row.payload))
      .filter(Boolean) as RefundRequest[];
  }
  return [...(ensureIndex().byStudent.get(studentId) ?? [])];
}

export function listRefundsByStatus(status: RefundRequest["status"]): RefundRequest[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE status = $1`, [status])
      .map((row) => asRefund(row.payload))
      .filter(Boolean) as RefundRequest[];
  }
  return [...(ensureIndex().byStatus.get(status) ?? [])];
}

export function getRefundById(id: string): RefundRequest | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE id = $1`, [id]);
    return asRefund(rows[0]?.payload ?? null);
  }
  return ensureIndex().byId.get(id) ?? null;
}

export function listAllRefunds(): RefundRequest[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map((row) => asRefund(row.payload))
      .filter(Boolean) as RefundRequest[];
  }
  return [...readRows()];
}

export function countRefunds(): number {
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ n: number | string }>(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    return Number(rows[0]?.n ?? 0);
  }
  return ensureIndex().byId.size;
}

export function countRefundsByStatus(status: RefundRequest["status"]): number {
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ n: number | string }>(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE status = $1`,
      [status],
    );
    return Number(rows[0]?.n ?? 0);
  }
  return (ensureIndex().byStatus.get(status) ?? []).length;
}

export function upsertRefund(item: RefundRequest): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, student_id, order_id, status, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         order_id = EXCLUDED.order_id,
         status = EXCLUDED.status,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.studentId, item.orderId, item.status, JSON.stringify(item)],
    );
    return;
  }
  const rows = readRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeRows(rows);
}

export function replaceAllRefunds(rows: RefundRequest[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(`DELETE FROM ${TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 5;
        values.push(row.id, row.studentId, row.orderId, row.status, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, student_id, order_id, status, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           student_id = EXCLUDED.student_id,
           order_id = EXCLUDED.order_id,
           status = EXCLUDED.status,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeRows(next);
}

/** Tests only. */
export function resetRefundStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
