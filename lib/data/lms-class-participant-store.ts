/**
 * Indexed live-class participants — never scan every invite to find one student.
 *
 * Production: Postgres `aep_lms_class_participants` keyed by live_class_id / user_id.
 * Local / tests: `.data/aep-class-participants.json` with in-memory indexes.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { MeetingParticipant } from "@/types/classes";

const FILE = path.join(dataDir(), "aep-class-participants.json");
const TABLE = "aep_lms_class_participants";

type ParticipantFile = { participants: MeetingParticipant[] };

let tableReady = false;
let fileIndex: {
  byId: Map<string, MeetingParticipant>;
  byClass: Map<string, MeetingParticipant[]>;
  byUser: Map<string, MeetingParticipant[]>;
} | null = null;

function emptyFile(): ParticipantFile {
  return { participants: [] };
}

function asParticipant(row: unknown): MeetingParticipant | null {
  if (!row || typeof row !== "object") return null;
  const value = row as MeetingParticipant;
  if (!value.id || !value.liveClassId || !value.userId) return null;
  return value;
}

function payloadFromSql(row: { payload?: unknown }): MeetingParticipant | null {
  return asParticipant(row.payload);
}

function ensureSqlTable(): void {
  if (tableReady || !postgresStoreEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_class_participants_class_idx ON ${TABLE} (live_class_id)`,
  );
  neonSql(`CREATE INDEX IF NOT EXISTS aep_lms_class_participants_user_idx ON ${TABLE} (user_id)`);
  tableReady = true;
}

function rebuildFileIndex(rows: MeetingParticipant[]): void {
  const byId = new Map<string, MeetingParticipant>();
  const byClass = new Map<string, MeetingParticipant[]>();
  const byUser = new Map<string, MeetingParticipant[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const course = byClass.get(row.liveClassId) ?? [];
    course.push(row);
    byClass.set(row.liveClassId, course);
    const user = byUser.get(row.userId) ?? [];
    user.push(row);
    byUser.set(row.userId, user);
  }
  fileIndex = { byId, byClass, byUser };
}

function readFileRows(): MeetingParticipant[] {
  const file = readJsonFile<ParticipantFile>(FILE, emptyFile);
  const rows = (file.participants ?? []).map(asParticipant).filter(Boolean) as MeetingParticipant[];
  if (!fileIndex) rebuildFileIndex(rows);
  return rows;
}

function ensureFileIndex(): NonNullable<typeof fileIndex> {
  if (fileIndex) return fileIndex;
  readFileRows();
  return fileIndex!;
}

function writeFileRows(rows: MeetingParticipant[]): void {
  rebuildFileIndex(rows);
  writeJsonFile(FILE, { participants: rows });
}

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

export function listParticipantsForClass(liveClassId: string): MeetingParticipant[] {
  if (!liveClassId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE live_class_id = $1`, [
      liveClassId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as MeetingParticipant[];
  }
  return [...(ensureFileIndex().byClass.get(liveClassId) ?? [])];
}

export function listParticipantsForUser(userId: string): MeetingParticipant[] {
  if (!userId) return [];
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE} WHERE user_id = $1`, [
      userId,
    ])
      .map(payloadFromSql)
      .filter(Boolean) as MeetingParticipant[];
  }
  return [...(ensureFileIndex().byUser.get(userId) ?? [])];
}

export function hasParticipant(
  liveClassId: string,
  userId: string,
  role?: MeetingParticipant["role"],
): boolean {
  return listParticipantsForClass(liveClassId).some(
    (row) => row.userId === userId && (!role || row.role === role),
  );
}

export function listAllParticipants(): MeetingParticipant[] {
  if (sqlEnabled()) {
    ensureSqlTable();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${TABLE}`)
      .map(payloadFromSql)
      .filter(Boolean) as MeetingParticipant[];
  }
  return [...readFileRows()];
}

export function upsertParticipant(participant: MeetingParticipant): void {
  if (sqlEnabled()) {
    ensureSqlTable();
    neonSql(
      `INSERT INTO ${TABLE} (id, live_class_id, user_id, role, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         live_class_id = EXCLUDED.live_class_id,
         user_id = EXCLUDED.user_id,
         role = EXCLUDED.role,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        participant.id,
        participant.liveClassId,
        participant.userId,
        participant.role,
        JSON.stringify(participant),
      ],
    );
    return;
  }
  const rows = readFileRows();
  const index = rows.findIndex((row) => row.id === participant.id);
  if (index >= 0) rows[index] = participant;
  else rows.push(participant);
  writeFileRows(rows);
}

export function replaceAllParticipants(rows: MeetingParticipant[]): void {
  const unique = new Map<string, MeetingParticipant>();
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
        values.push(row.id, row.liveClassId, row.userId, row.role, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${TABLE} (id, live_class_id, user_id, role, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (id) DO UPDATE SET
           live_class_id = EXCLUDED.live_class_id,
           user_id = EXCLUDED.user_id,
           role = EXCLUDED.role,
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
export function resetClassParticipantStoreRuntime(): void {
  tableReady = false;
  fileIndex = null;
}
