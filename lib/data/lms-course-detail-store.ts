/**
 * Indexed course syllabuses — never hydrate the 15MB catalog to open one subject.
 *
 * Production: Postgres `aep_lms_course_details` keyed by id / code / stable id.
 * Local / tests: `.data/aep-course-details.json` with in-memory indexes.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import { stableCourseId } from "@/lib/courses/public-course-path";
import type { CourseDetail } from "@/types/courses";

const FILE = path.join(dataDir(), "aep-course-details.json");
const TABLE = "aep_lms_course_details";

type CourseDetailFile = { details: CourseDetail[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, CourseDetail>;
  byCode: Map<string, CourseDetail>;
  byStableId: Map<string, CourseDetail>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asDetail(row: unknown): CourseDetail | null {
  if (!row || typeof row !== "object") return null;
  const value = row as CourseDetail;
  if (!value.id || !Array.isArray(value.modules)) return null;
  return value;
}

function stableIdFor(detail: CourseDetail): string {
  return detail.code ? stableCourseId(detail.code) : detail.id;
}

function ensureSqlTable(): void {
  if (tableReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      code TEXT,
      stable_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_course_details_code_idx ON ${TABLE} (code)`);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_course_details_stable_idx ON ${TABLE} (stable_id)`);
  tableReady = true;
}

function rebuildIndex(rows: CourseDetail[]): void {
  const byId = new Map<string, CourseDetail>();
  const byCode = new Map<string, CourseDetail>();
  const byStableId = new Map<string, CourseDetail>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.code) byCode.set(row.code.trim().toLowerCase(), row);
    byStableId.set(stableIdFor(row), row);
  }
  fileIndex = { byId, byCode, byStableId };
}

function readRows(): CourseDetail[] {
  const file = readJsonFile<CourseDetailFile>(FILE, () => ({ details: [] }));
  const rows = (file.details ?? []).map(asDetail).filter(Boolean) as CourseDetail[];
  if (!fileIndex) rebuildIndex(rows);
  return rows;
}

function ensureIndex() {
  if (!fileIndex) readRows();
  return fileIndex!;
}

function writeRows(rows: CourseDetail[]): void {
  rebuildIndex(rows);
  writeJsonFile(FILE, { details: rows });
}

function lookupFile(ref: string): CourseDetail | null {
  const key = decodeURIComponent(ref || "").trim();
  if (!key) return null;
  const index = ensureIndex();
  return (
    index.byId.get(key) ?? index.byCode.get(key.toLowerCase()) ?? index.byStableId.get(key) ?? null
  );
}

export function getStoredCourseDetail(ref: string): CourseDetail | null {
  const key = decodeURIComponent(ref || "").trim();
  if (!key) return null;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${TABLE}
       WHERE id = $1
          OR lower(coalesce(code, '')) = lower($1)
          OR stable_id = $1
       LIMIT 1`,
      [key],
    );
    return asDetail(rows[0]?.payload ?? null);
  }
  return lookupFile(key);
}

export function upsertCourseDetail(detail: CourseDetail): void {
  if (!detail?.id) return;
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, code, stable_id, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         stable_id = EXCLUDED.stable_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [detail.id, detail.code ?? null, stableIdFor(detail), JSON.stringify(detail)],
    );
    return;
  }
  const rows = readRows();
  const index = rows.findIndex((row) => row.id === detail.id);
  if (index >= 0) rows[index] = detail;
  else rows.push(detail);
  writeRows(rows);
}

export function replaceAllCourseDetails(rows: CourseDetail[]): void {
  const unique = new Map<string, CourseDetail>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTable();
    for (const row of next) upsertCourseDetail(row);
    return;
  }
  writeRows(next);
}

export function listStoredCourseDetails(): CourseDetail[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map((row) => asDetail(row.payload))
      .filter(Boolean) as CourseDetail[];
  }
  return [...readRows()];
}

export function resetCourseDetailStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
