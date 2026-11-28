/**
 * Indexed live-class attendance — never hydrate aep-classes.json to mark one join.
 *
 * Production: Postgres `aep_lms_class_attendance` keyed by live_class_id / student_id.
 * Local / tests: `.data/aep-class-attendance.json` with in-memory indexes.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { AttendanceRecord } from "@/types/classes";

const FILE = path.join(dataDir(), "aep-class-attendance.json");
const TABLE = "aep_lms_class_attendance";

type AttendanceFile = { attendance: AttendanceRecord[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, AttendanceRecord>;
  byClass: Map<string, AttendanceRecord[]>;
  byStudent: Map<string, AttendanceRecord[]>;
} | null = null;

function emptyFile(): AttendanceFile {
  return { attendance: [] };
}

function asAttendance(row: unknown): AttendanceRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as AttendanceRecord;
  if (!value.id || !value.liveClassId || !value.studentId) return null;
  return value;
}

function payloadFromSql(row: { payload?: unknown }): AttendanceRecord | null {
  return asAttendance(row.payload);
}

function ensureSqlTable(): void {
  if (tableReady || !postgresStoreEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_class_attendance_class_idx ON ${TABLE} (live_class_id)`,
  );
  neonSql(
    `CREATE UNIQUE INDEX IF NOT EXISTS aep_lms_class_attendance_student_idx
     ON ${TABLE} (live_class_id, student_id)`,
  );
  tableReady = true;
}

function rebuildFileIndex(rows: AttendanceRecord[]): void {
  const byId = new Map<string, AttendanceRecord>();
  const byClass = new Map<string, AttendanceRecord[]>();
  const byStudent = new Map<string, AttendanceRecord[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const course = byClass.get(row.liveClassId) ?? [];
    course.push(row);
    byClass.set(row.liveClassId, course);
    const student = byStudent.get(row.studentId) ?? [];
    student.push(row);
    byStudent.set(row.studentId, student);
  }
  fileIndex = { byId, byClass, byStudent };
}

function readFileRows(): AttendanceRecord[] {
  const file = readJsonFile<AttendanceFile>(FILE, emptyFile);
  const rows = (file.attendance ?? []).map(asAttendance).filter(Boolean) as AttendanceRecord[];
  if (!fileIndex) rebuildFileIndex(rows);
  return rows;
}

function ensureFileIndex(): NonNullable<typeof fileIndex> {
  if (fileIndex) return fileIndex;
  readFileRows();
  return fileIndex!;
}

function writeFileRows(rows: AttendanceRecord[]): void {
  rebuildFileIndex(rows);
  writeJsonFile(FILE, { attendance: rows });
}

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

export function listAttendanceForClass(liveClassId: string): AttendanceRecord[] {
  if (!liveClassId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE live_class_id = $1`, [
      liveClassId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as AttendanceRecord[];
  }
  return [...(ensureFileIndex().byClass.get(liveClassId) ?? [])];
}

export function getAttendanceForStudent(
  liveClassId: string,
  studentId: string,
): AttendanceRecord | null {
  if (!liveClassId || !studentId) return null;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${TABLE} WHERE live_class_id = $1 AND student_id = $2 LIMIT 1`,
      [liveClassId, studentId],
    );
    return payloadFromSql(rows[0] ?? {});
  }
  return (
    ensureFileIndex().byClass.get(liveClassId)?.find((row) => row.studentId === studentId) ?? null
  );
}

export function listAllAttendance(): AttendanceRecord[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map(payloadFromSql)
      .filter(Boolean) as AttendanceRecord[];
  }
  return [...readFileRows()];
}

export function upsertAttendanceRecord(record: AttendanceRecord): void {
  if (!record?.id || !record.liveClassId || !record.studentId) return;
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, live_class_id, student_id, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         live_class_id = EXCLUDED.live_class_id,
         student_id = EXCLUDED.student_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [record.id, record.liveClassId, record.studentId, JSON.stringify(record)],
    );
    return;
  }
  const rows = readFileRows();
  const index = rows.findIndex((row) => row.id === record.id);
  if (index >= 0) rows[index] = record;
  else {
    const existing = rows.findIndex(
      (row) => row.liveClassId === record.liveClassId && row.studentId === record.studentId,
    );
    if (existing >= 0) rows[existing] = record;
    else rows.push(record);
  }
  writeFileRows(rows);
}

export function replaceAllAttendance(rows: AttendanceRecord[]): void {
  const unique = new Map<string, AttendanceRecord>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(`DELETE FROM ${TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 4;
        values.push(row.id, row.liveClassId, row.studentId, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, live_class_id, student_id, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           live_class_id = EXCLUDED.live_class_id,
           student_id = EXCLUDED.student_id,
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
export function resetClassAttendanceStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
