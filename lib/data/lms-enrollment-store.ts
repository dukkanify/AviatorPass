/**
 * Indexed LMS enrollments — never load 15k rows to find one student.
 *
 * Production: Postgres `aep_lms_enrollments` keyed by student_id / course_id.
 * Local / tests: `.data/aep-enrollments.json` with in-memory indexes.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { Enrollment } from "@/types/courses";

const FILE = path.join(dataDir(), "aep-enrollments.json");
const TABLE = "aep_lms_enrollments";

type EnrollmentFile = { enrollments: Enrollment[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, Enrollment>;
  byStudent: Map<string, Enrollment[]>;
  byCourse: Map<string, Enrollment[]>;
} | null = null;

function emptyFile(): EnrollmentFile {
  return { enrollments: [] };
}

function asEnrollment(row: unknown): Enrollment | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Enrollment;
  if (!value.id || !value.courseId || !value.studentId) return null;
  return value;
}

function payloadFromSql(row: { payload?: unknown }): Enrollment | null {
  return asEnrollment(row.payload);
}

function ensureSqlTable(): void {
  if (tableReady || !postgresStoreEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_enrollments_student_idx ON ${TABLE} (student_id)`);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_enrollments_course_idx ON ${TABLE} (course_id)`);
  tableReady = true;
}

function rebuildFileIndex(rows: Enrollment[]): void {
  const byId = new Map<string, Enrollment>();
  const byStudent = new Map<string, Enrollment[]>();
  const byCourse = new Map<string, Enrollment[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const student = byStudent.get(row.studentId) ?? [];
    student.push(row);
    byStudent.set(row.studentId, student);
    const course = byCourse.get(row.courseId) ?? [];
    course.push(row);
    byCourse.set(row.courseId, course);
  }
  fileIndex = { byId, byStudent, byCourse };
}

function readFileRows(): Enrollment[] {
  const file = readJsonFile<EnrollmentFile>(FILE, emptyFile);
  const rows = (file.enrollments ?? []).map(asEnrollment).filter(Boolean) as Enrollment[];
  if (!fileIndex) rebuildFileIndex(rows);
  return rows;
}

function writeFileRows(rows: Enrollment[]): void {
  rebuildFileIndex(rows);
  writeJsonFile(FILE, { enrollments: rows });
}

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

export function listEnrollmentsForStudent(studentId: string): Enrollment[] {
  if (!studentId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE student_id = $1`, [
      studentId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as Enrollment[];
  }
  readFileRows();
  return [...(fileIndex?.byStudent.get(studentId) ?? [])];
}

export function listEnrollmentsForCourse(courseId: string): Enrollment[] {
  if (!courseId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE course_id = $1`, [
      courseId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as Enrollment[];
  }
  readFileRows();
  return [...(fileIndex?.byCourse.get(courseId) ?? [])];
}

export function getEnrollmentById(id: string): Enrollment | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE id = $1`, [id]);
    return payloadFromSql(rows[0] ?? {}) ?? null;
  }
  readFileRows();
  return fileIndex?.byId.get(id) ?? null;
}

export function listAllEnrollments(): Enrollment[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map(payloadFromSql)
      .filter(Boolean) as Enrollment[];
  }
  return [...readFileRows()];
}

export function upsertEnrollment(enrollment: Enrollment): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, course_id, student_id, status, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         student_id = EXCLUDED.student_id,
         status = EXCLUDED.status,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        enrollment.id,
        enrollment.courseId,
        enrollment.studentId,
        enrollment.status,
        JSON.stringify(enrollment),
      ],
    );
    return;
  }
  const rows = readFileRows();
  const index = rows.findIndex((row) => row.id === enrollment.id);
  if (index >= 0) rows[index] = enrollment;
  else rows.push(enrollment);
  writeFileRows(rows);
}

export function replaceAllEnrollments(rows: Enrollment[]): void {
  const unique = new Map<string, Enrollment>();
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
        const base = offset * 5;
        values.push(row.id, row.courseId, row.studentId, row.status, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, course_id, student_id, status, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           course_id = EXCLUDED.course_id,
           student_id = EXCLUDED.student_id,
           status = EXCLUDED.status,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeFileRows(next);
}

export function enrollmentStoreHasRows(): boolean {
  if (sqlEnabled()) {
    ensureSqlTable();
    const rows = neonSql<{ n: number | string }>(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    return Number(rows[0]?.n ?? 0) > 0;
  }
  return readFileRows().length > 0;
}

/** Tests only. */
export function resetEnrollmentStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
