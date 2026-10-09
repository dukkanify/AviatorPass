/**
 * Indexed installment plans and schedule — never hydrate 1.2k plans with
 * the payments catalog to find one student or one due row.
 *
 * Production: Postgres `aep_lms_installment_*` keyed by student / plan / status.
 * Local / tests: `.data/aep-installment-*.json` with in-memory indexes.
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
import type { InstallmentPlan, InstallmentScheduleItem } from "@/types/payments";

const PLAN_FILE = path.join(dataDir(), "aep-installment-plans.json");
const SCHEDULE_FILE = path.join(dataDir(), "aep-installment-schedule.json");
const PLAN_TABLE = "aep_lms_installment_plans";
const SCHEDULE_TABLE = "aep_lms_installment_schedule";

type PlanFile = { plans: InstallmentPlan[] };
type ScheduleFile = { schedule: InstallmentScheduleItem[] };

let tablesReady = false;
let planIndex: {
  byId: Map<string, InstallmentPlan>;
  byStudent: Map<string, InstallmentPlan[]>;
  byOrder: Map<string, InstallmentPlan[]>;
  byStatus: Map<string, InstallmentPlan[]>;
} | null = null;
let scheduleIndex: {
  byId: Map<string, InstallmentScheduleItem>;
  byPlan: Map<string, InstallmentScheduleItem[]>;
  byStatus: Map<string, InstallmentScheduleItem[]>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asPlan(row: unknown): InstallmentPlan | null {
  if (!row || typeof row !== "object") return null;
  const value = row as InstallmentPlan;
  if (!value.id || !value.studentId || !value.orderId) return null;
  return value;
}

function asSchedule(row: unknown): InstallmentScheduleItem | null {
  if (!row || typeof row !== "object") return null;
  const value = row as InstallmentScheduleItem;
  if (!value.id || !value.planId) return null;
  return {
    ...value,
    reminderSentAt: Array.isArray(value.reminderSentAt) ? value.reminderSentAt : [],
  };
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
    CREATE TABLE IF NOT EXISTS ${PLAN_TABLE} (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_student_idx ON ${PLAN_TABLE} (student_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_order_idx ON ${PLAN_TABLE} (order_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_installment_plans_status_idx ON ${PLAN_TABLE} (status)`,
  );
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${SCHEDULE_TABLE} (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_installment_schedule_plan_idx ON ${SCHEDULE_TABLE} (plan_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_installment_schedule_status_idx ON ${SCHEDULE_TABLE} (status)`,
  );
  tablesReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildPlanIndex(rows: InstallmentPlan[]): void {
  const byId = new Map<string, InstallmentPlan>();
  const byStudent = new Map<string, InstallmentPlan[]>();
  const byOrder = new Map<string, InstallmentPlan[]>();
  const byStatus = new Map<string, InstallmentPlan[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byStudent, row.studentId, row);
    pushMap(byOrder, row.orderId, row);
    pushMap(byStatus, row.status, row);
  }
  planIndex = { byId, byStudent, byOrder, byStatus };
}

function rebuildScheduleIndex(rows: InstallmentScheduleItem[]): void {
  const byId = new Map<string, InstallmentScheduleItem>();
  const byPlan = new Map<string, InstallmentScheduleItem[]>();
  const byStatus = new Map<string, InstallmentScheduleItem[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byPlan, row.planId, row);
    pushMap(byStatus, row.status, row);
  }
  scheduleIndex = { byId, byPlan, byStatus };
}

function readPlanRows(): InstallmentPlan[] {
  const file = readJsonFile<PlanFile>(PLAN_FILE, () => ({ plans: [] }));
  const rows = (file.plans ?? []).map(asPlan).filter(Boolean) as InstallmentPlan[];
  if (!planIndex) rebuildPlanIndex(rows);
  return rows;
}

function readScheduleRows(): InstallmentScheduleItem[] {
  const file = readJsonFile<ScheduleFile>(SCHEDULE_FILE, () => ({ schedule: [] }));
  const rows = (file.schedule ?? []).map(asSchedule).filter(Boolean) as InstallmentScheduleItem[];
  if (!scheduleIndex) rebuildScheduleIndex(rows);
  return rows;
}

function ensurePlanIndex() {
  if (!planIndex) readPlanRows();
  return planIndex!;
}

function ensureScheduleIndex() {
  if (!scheduleIndex) readScheduleRows();
  return scheduleIndex!;
}

function writePlanRows(rows: InstallmentPlan[]): void {
  rebuildPlanIndex(rows);
  writeJsonFile(PLAN_FILE, { plans: rows });
}

function writeScheduleRows(rows: InstallmentScheduleItem[]): void {
  rebuildScheduleIndex(rows);
  writeJsonFile(SCHEDULE_FILE, { schedule: rows });
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  return [...unique.values()];
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

export function listInstallmentPlansForStudent(studentId: string): InstallmentPlan[] {
  if (!studentId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PLAN_TABLE} WHERE student_id = $1`,
      [studentId],
    )
      .map((row) => payloadFromSql(row, asPlan))
      .filter(Boolean) as InstallmentPlan[];
  }
  return [...(ensurePlanIndex().byStudent.get(studentId) ?? [])];
}

export function listInstallmentPlansByStatus(
  statuses: InstallmentPlan["status"][],
): InstallmentPlan[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    if (statuses.length === 0) return [];
    const placeholders = statuses.map((_, index) => `$${index + 1}`).join(", ");
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PLAN_TABLE} WHERE status IN (${placeholders})`,
      statuses,
    )
      .map((row) => payloadFromSql(row, asPlan))
      .filter(Boolean) as InstallmentPlan[];
  }
  return statuses.flatMap((status) => [...(ensurePlanIndex().byStatus.get(status) ?? [])]);
}

export function getInstallmentPlanById(id: string): InstallmentPlan | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${PLAN_TABLE} WHERE id = $1`, [
      id,
    ]);
    return payloadFromSql(rows[0] ?? {}, asPlan);
  }
  return ensurePlanIndex().byId.get(id) ?? null;
}

export function listAllInstallmentPlans(): InstallmentPlan[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${PLAN_TABLE}`)
      .map((row) => payloadFromSql(row, asPlan))
      .filter(Boolean) as InstallmentPlan[];
  }
  return [...readPlanRows()];
}

export function upsertInstallmentPlan(item: InstallmentPlan): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${PLAN_TABLE} (id, student_id, order_id, status, payload, updated_at)
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
  const rows = readPlanRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writePlanRows(rows);
}

export function replaceAllInstallmentPlans(rows: InstallmentPlan[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${PLAN_TABLE}`);
    chunkInsert(
      PLAN_TABLE,
      "id, student_id, order_id, status, payload",
      5,
      next.map((row) => [row.id, row.studentId, row.orderId, row.status, JSON.stringify(row)]),
      `student_id = EXCLUDED.student_id,
       order_id = EXCLUDED.order_id,
       status = EXCLUDED.status,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writePlanRows(next);
}

export function listScheduleForPlan(planId: string): InstallmentScheduleItem[] {
  if (!planId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SCHEDULE_TABLE} WHERE plan_id = $1`,
      [planId],
    )
      .map((row) => payloadFromSql(row, asSchedule))
      .filter(Boolean) as InstallmentScheduleItem[];
  }
  return [...(ensureScheduleIndex().byPlan.get(planId) ?? [])];
}

export function listScheduleByStatus(
  statuses: InstallmentScheduleItem["status"][],
): InstallmentScheduleItem[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    if (statuses.length === 0) return [];
    const placeholders = statuses.map((_, index) => `$${index + 1}`).join(", ");
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SCHEDULE_TABLE} WHERE status IN (${placeholders})`,
      statuses,
    )
      .map((row) => payloadFromSql(row, asSchedule))
      .filter(Boolean) as InstallmentScheduleItem[];
  }
  return statuses.flatMap((status) => [...(ensureScheduleIndex().byStatus.get(status) ?? [])]);
}

export function getScheduleItemById(id: string): InstallmentScheduleItem | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SCHEDULE_TABLE} WHERE id = $1`,
      [id],
    );
    return payloadFromSql(rows[0] ?? {}, asSchedule);
  }
  return ensureScheduleIndex().byId.get(id) ?? null;
}

export function listAllInstallmentSchedule(): InstallmentScheduleItem[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${SCHEDULE_TABLE}`)
      .map((row) => payloadFromSql(row, asSchedule))
      .filter(Boolean) as InstallmentScheduleItem[];
  }
  return [...readScheduleRows()];
}

export function upsertScheduleItem(item: InstallmentScheduleItem): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${SCHEDULE_TABLE} (id, plan_id, status, due_at, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         due_at = EXCLUDED.due_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.planId, item.status, item.dueAt, JSON.stringify(item)],
    );
    return;
  }
  const rows = readScheduleRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeScheduleRows(rows);
}

export function replaceAllInstallmentSchedule(rows: InstallmentScheduleItem[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${SCHEDULE_TABLE}`);
    chunkInsert(
      SCHEDULE_TABLE,
      "id, plan_id, status, due_at, payload",
      5,
      next.map((row) => [row.id, row.planId, row.status, row.dueAt, JSON.stringify(row)]),
      `plan_id = EXCLUDED.plan_id,
       status = EXCLUDED.status,
       due_at = EXCLUDED.due_at,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeScheduleRows(next);
}

/** Tests only. */
export function resetInstallmentStoreRuntime(): void {
  tablesReady = false;
  planIndex = null;
  scheduleIndex = null;
}
