/**
 * Indexed instructor wallet ledger and payment transaction logs — never
 * hydrate the payments catalog to list one instructor or the recent audit.
 *
 * Production: Postgres `aep_lms_wallet_transactions` / `aep_lms_transaction_logs`.
 * Local / tests: `.data/aep-wallet-transactions.json` and `.data/aep-transaction-logs.json`.
 * Wallet rows are transactional and never capped. Logs are capped at 400 newest.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { TransactionLog, WalletTransaction } from "@/types/payments";

const WALLET_FILE = path.join(dataDir(), "aep-wallet-transactions.json");
const LOG_FILE = path.join(dataDir(), "aep-transaction-logs.json");
const WALLET_TABLE = "aep_lms_wallet_transactions";
const LOG_TABLE = "aep_lms_transaction_logs";

/** Lifetime bound for payment audit history. Newest rows are kept. */
export const PAYMENT_LOG_CAP = 400;

type WalletFile = { walletTransactions: WalletTransaction[] };
type LogFile = { transactionLogs: TransactionLog[] };

let tablesReady = false;
let walletIndex: {
  byId: Map<string, WalletTransaction>;
  byInstructor: Map<string, WalletTransaction[]>;
} | null = null;
let logIndex: {
  byId: Map<string, TransactionLog>;
  byStudent: Map<string, TransactionLog[]>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asWallet(row: unknown): WalletTransaction | null {
  if (!row || typeof row !== "object") return null;
  const value = row as WalletTransaction;
  if (!value.id || !value.instructorId || !value.walletId || !value.createdAt) return null;
  return value;
}

function asLog(row: unknown): TransactionLog | null {
  if (!row || typeof row !== "object") return null;
  const value = row as TransactionLog;
  if (!value.id || !value.kind || !value.createdAt) return null;
  return value;
}

function payloadFromSql<T>(
  row: { payload?: unknown },
  parse: (value: unknown) => T | null,
): T | null {
  return parse(row.payload);
}

function ensureSqlTables(): void {
  if (tablesReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${WALLET_TABLE} (
      id TEXT PRIMARY KEY,
      instructor_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      order_id TEXT,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_wallet_transactions_instructor_idx ON ${WALLET_TABLE} (instructor_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_wallet_transactions_wallet_idx ON ${WALLET_TABLE} (wallet_id)`,
  );
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      instructor_id TEXT,
      kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_transaction_logs_student_idx ON ${LOG_TABLE} (student_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_transaction_logs_created_idx ON ${LOG_TABLE} (created_at DESC)`,
  );
  tablesReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildWalletIndex(rows: WalletTransaction[]): void {
  const byId = new Map<string, WalletTransaction>();
  const byInstructor = new Map<string, WalletTransaction[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byInstructor, row.instructorId, row);
  }
  walletIndex = { byId, byInstructor };
}

function rebuildLogIndex(rows: TransactionLog[]): void {
  const byId = new Map<string, TransactionLog>();
  const byStudent = new Map<string, TransactionLog[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.studentId) pushMap(byStudent, row.studentId, row);
  }
  logIndex = { byId, byStudent };
}

function readWalletRows(): WalletTransaction[] {
  const file = readJsonFile<WalletFile>(WALLET_FILE, () => ({ walletTransactions: [] }));
  const rows = (file.walletTransactions ?? []).map(asWallet).filter(Boolean) as WalletTransaction[];
  if (!walletIndex) rebuildWalletIndex(rows);
  return rows;
}

function readLogRows(): TransactionLog[] {
  const file = readJsonFile<LogFile>(LOG_FILE, () => ({ transactionLogs: [] }));
  const rows = (file.transactionLogs ?? []).map(asLog).filter(Boolean) as TransactionLog[];
  if (!logIndex) rebuildLogIndex(rows);
  return rows;
}

function ensureWalletIndex() {
  if (!walletIndex) readWalletRows();
  return walletIndex!;
}

function writeWalletRows(rows: WalletTransaction[]): void {
  rebuildWalletIndex(rows);
  writeJsonFile(WALLET_FILE, { walletTransactions: rows });
}

function writeLogRows(rows: TransactionLog[]): void {
  rebuildLogIndex(rows);
  writeJsonFile(LOG_FILE, { transactionLogs: rows });
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  return [...unique.values()];
}

function compareNewest(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export function trimTransactionLogs(rows: TransactionLog[]): TransactionLog[] {
  return [...rows].sort(compareNewest).slice(0, PAYMENT_LOG_CAP);
}

function trimLogsInSql(): void {
  const rows = neonSql<{ id: string }>(
    `SELECT id FROM ${LOG_TABLE} ORDER BY created_at DESC, id DESC`,
  );
  if (rows.length <= PAYMENT_LOG_CAP) return;
  for (const row of rows.slice(PAYMENT_LOG_CAP)) {
    neonSql(`DELETE FROM ${LOG_TABLE} WHERE id = $1`, [row.id]);
  }
}

function chunkInsert(
  table: string,
  columns: string,
  rowWidth: number,
  rows: unknown[][],
  conflict: string,
): void {
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk.map((row, offset) => {
      const base = offset * rowWidth;
      values.push(...row);
      return `(${row
        .map((_, index) => `$${base + index + 1}${index === rowWidth - 1 ? "::jsonb" : ""}`)
        .join(", ")}, NOW())`;
    });
    neonSql(
      `INSERT INTO ${table} (${columns}, updated_at)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (id) DO UPDATE SET ${conflict}, updated_at = NOW()`,
      values,
    );
  }
}

export function listWalletTransactionsForInstructor(instructorId: string): WalletTransaction[] {
  if (!instructorId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${WALLET_TABLE} WHERE instructor_id = $1`,
      [instructorId],
    )
      .map((row) => payloadFromSql(row, asWallet))
      .filter(Boolean) as WalletTransaction[];
  }
  return [...(ensureWalletIndex().byInstructor.get(instructorId) ?? [])];
}

export function listAllWalletTransactions(): WalletTransaction[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${WALLET_TABLE}`)
      .map((row) => payloadFromSql(row, asWallet))
      .filter(Boolean) as WalletTransaction[];
  }
  return [...readWalletRows()];
}

export function upsertWalletTransaction(item: WalletTransaction): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${WALLET_TABLE} (id, instructor_id, wallet_id, order_id, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         instructor_id = EXCLUDED.instructor_id,
         wallet_id = EXCLUDED.wallet_id,
         order_id = EXCLUDED.order_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.instructorId, item.walletId, item.orderId, JSON.stringify(item)],
    );
    return;
  }
  const rows = readWalletRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeWalletRows(rows);
}

export function replaceAllWalletTransactions(rows: WalletTransaction[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${WALLET_TABLE}`);
    chunkInsert(
      WALLET_TABLE,
      "id, instructor_id, wallet_id, order_id, payload",
      5,
      next.map((row) => [row.id, row.instructorId, row.walletId, row.orderId, JSON.stringify(row)]),
      `instructor_id = EXCLUDED.instructor_id,
       wallet_id = EXCLUDED.wallet_id,
       order_id = EXCLUDED.order_id,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeWalletRows(next);
}

export function listRecentTransactionLogs(limit = 100): TransactionLog[] {
  const cap = Math.max(0, Math.min(limit, PAYMENT_LOG_CAP));
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${LOG_TABLE} ORDER BY created_at DESC, id DESC LIMIT $1`,
      [cap],
    )
      .map((row) => payloadFromSql(row, asLog))
      .filter(Boolean) as TransactionLog[];
  }
  return [...readLogRows()].sort(compareNewest).slice(0, cap);
}

export function listAllTransactionLogs(): TransactionLog[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${LOG_TABLE} ORDER BY created_at DESC, id DESC`,
    )
      .map((row) => payloadFromSql(row, asLog))
      .filter(Boolean) as TransactionLog[];
  }
  return [...readLogRows()].sort(compareNewest);
}

export function upsertTransactionLog(item: TransactionLog): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${LOG_TABLE} (id, student_id, instructor_id, kind, created_at, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         instructor_id = EXCLUDED.instructor_id,
         kind = EXCLUDED.kind,
         created_at = EXCLUDED.created_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.studentId, item.instructorId, item.kind, item.createdAt, JSON.stringify(item)],
    );
    trimLogsInSql();
    return;
  }
  const rows = readLogRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeLogRows(trimTransactionLogs(rows));
}

export function replaceAllTransactionLogs(rows: TransactionLog[]): void {
  const next = trimTransactionLogs(uniqueById(rows));
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${LOG_TABLE}`);
    chunkInsert(
      LOG_TABLE,
      "id, student_id, instructor_id, kind, created_at, payload",
      6,
      next.map((row) => [
        row.id,
        row.studentId,
        row.instructorId,
        row.kind,
        row.createdAt,
        JSON.stringify(row),
      ]),
      `student_id = EXCLUDED.student_id,
       instructor_id = EXCLUDED.instructor_id,
       kind = EXCLUDED.kind,
       created_at = EXCLUDED.created_at,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeLogRows(next);
}

/** Tests only. */
export function resetPaymentActivityStoreRuntime(): void {
  tablesReady = false;
  walletIndex = null;
  logIndex = null;
}
