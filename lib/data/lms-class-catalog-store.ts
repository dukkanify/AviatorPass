/**
 * Indexed live classes and Zoom meetings — never hydrate aep-classes.json
 * to open one classroom.
 *
 * Production: Postgres `aep_lms_live_classes` / `aep_lms_zoom_meetings`.
 * Local / tests: `.data/aep-live-classes.json` and `.data/aep-zoom-meetings.json`.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { LiveClass, ZoomMeetingRecord } from "@/types/classes";

const CLASS_FILE = path.join(dataDir(), "aep-live-classes.json");
const MEETING_FILE = path.join(dataDir(), "aep-zoom-meetings.json");
const CLASS_TABLE = "aep_lms_live_classes";
const MEETING_TABLE = "aep_lms_zoom_meetings";

type ClassFile = { classes: LiveClass[] };
type MeetingFile = { meetings: ZoomMeetingRecord[] };

let tablesReady = false;
let classIndex: {
  byId: Map<string, LiveClass>;
} | null = null;
let meetingIndex: {
  byId: Map<string, ZoomMeetingRecord>;
  byClass: Map<string, ZoomMeetingRecord>;
  byNumber: Map<string, ZoomMeetingRecord>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asClass(row: unknown): LiveClass | null {
  if (!row || typeof row !== "object") return null;
  const value = row as LiveClass;
  if (!value.id || !value.title) return null;
  return value;
}

function asMeeting(row: unknown): ZoomMeetingRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as ZoomMeetingRecord;
  if (!value.id || !value.liveClassId) return null;
  return value;
}

function ensureSqlTables(): void {
  if (tablesReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${CLASS_TABLE} (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${MEETING_TABLE} (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL,
      zoom_meeting_id TEXT,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_zoom_meetings_class_idx ON ${MEETING_TABLE} (live_class_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_zoom_meetings_number_idx ON ${MEETING_TABLE} (zoom_meeting_id)`,
  );
  tablesReady = true;
}

function rebuildClassIndex(rows: LiveClass[]): void {
  const byId = new Map<string, LiveClass>();
  for (const row of rows) byId.set(row.id, row);
  classIndex = { byId };
}

function rebuildMeetingIndex(rows: ZoomMeetingRecord[]): void {
  const byId = new Map<string, ZoomMeetingRecord>();
  const byClass = new Map<string, ZoomMeetingRecord>();
  const byNumber = new Map<string, ZoomMeetingRecord>();
  for (const row of rows) {
    byId.set(row.id, row);
    byClass.set(row.liveClassId, row);
    if (row.zoomMeetingId) byNumber.set(row.zoomMeetingId, row);
  }
  meetingIndex = { byId, byClass, byNumber };
}

function readClassRows(): LiveClass[] {
  const file = readJsonFile<ClassFile>(CLASS_FILE, () => ({ classes: [] }));
  const rows = (file.classes ?? []).map(asClass).filter(Boolean) as LiveClass[];
  if (!classIndex) rebuildClassIndex(rows);
  return rows;
}

function readMeetingRows(): ZoomMeetingRecord[] {
  const file = readJsonFile<MeetingFile>(MEETING_FILE, () => ({ meetings: [] }));
  const rows = (file.meetings ?? []).map(asMeeting).filter(Boolean) as ZoomMeetingRecord[];
  if (!meetingIndex) rebuildMeetingIndex(rows);
  return rows;
}

function writeClassRows(rows: LiveClass[]): void {
  rebuildClassIndex(rows);
  writeJsonFile(CLASS_FILE, { classes: rows });
}

function writeMeetingRows(rows: ZoomMeetingRecord[]): void {
  rebuildMeetingIndex(rows);
  writeJsonFile(MEETING_FILE, { meetings: rows });
}

export function getStoredLiveClass(id: string): LiveClass | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${CLASS_TABLE} WHERE id = $1`, [
      id,
    ]);
    return asClass(rows[0]?.payload ?? null);
  }
  if (!classIndex) readClassRows();
  return classIndex!.byId.get(id) ?? null;
}

export function countStoredLiveClasses(): number {
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ n: number | string }>(`SELECT COUNT(*)::int AS n FROM ${CLASS_TABLE}`);
    return Number(rows[0]?.n ?? 0);
  }
  return readClassRows().length;
}

export function upsertLiveClass(item: LiveClass): void {
  if (!item?.id) return;
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${CLASS_TABLE} (id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [item.id, JSON.stringify(item)],
    );
    return;
  }
  const rows = readClassRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writeClassRows(rows);
}

export function replaceAllLiveClasses(rows: LiveClass[]): void {
  const unique = new Map<string, LiveClass>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${CLASS_TABLE}`);
    for (const row of next) upsertLiveClass(row);
    return;
  }
  writeClassRows(next);
}

export function getStoredZoomMeetingByClassId(liveClassId: string): ZoomMeetingRecord | null {
  if (!liveClassId) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${MEETING_TABLE} WHERE live_class_id = $1 LIMIT 1`,
      [liveClassId],
    );
    return asMeeting(rows[0]?.payload ?? null);
  }
  if (!meetingIndex) readMeetingRows();
  return meetingIndex!.byClass.get(liveClassId) ?? null;
}

export function getStoredZoomMeetingByNumber(
  meetingNumber: string | null | undefined,
): ZoomMeetingRecord | null {
  const id = String(meetingNumber ?? "").replace(/\D/g, "");
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${MEETING_TABLE} WHERE zoom_meeting_id = $1 LIMIT 1`,
      [id],
    );
    return asMeeting(rows[0]?.payload ?? null);
  }
  if (!meetingIndex) readMeetingRows();
  return meetingIndex!.byNumber.get(id) ?? null;
}

export function upsertZoomMeeting(item: ZoomMeetingRecord): void {
  if (!item?.id || !item.liveClassId) return;
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${MEETING_TABLE} (id, live_class_id, zoom_meeting_id, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         live_class_id = EXCLUDED.live_class_id,
         zoom_meeting_id = EXCLUDED.zoom_meeting_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.liveClassId, item.zoomMeetingId ?? null, JSON.stringify(item)],
    );
    return;
  }
  const rows = readMeetingRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writeMeetingRows(rows);
}

export function replaceAllZoomMeetings(rows: ZoomMeetingRecord[]): void {
  const unique = new Map<string, ZoomMeetingRecord>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${MEETING_TABLE}`);
    for (const row of next) upsertZoomMeeting(row);
    return;
  }
  writeMeetingRows(next);
}

/** Tests only. */
export function resetClassCatalogStoreRuntime(): void {
  tablesReady = false;
  classIndex = null;
  meetingIndex = null;
}
