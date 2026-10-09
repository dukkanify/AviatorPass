/**
 * Indexed auth users and sessions — never hydrate the auth catalog to
 * resolve one signed-in student or one session heartbeat.
 *
 * Production: Postgres `aep_auth_users` / `aep_auth_sessions`.
 * Local / tests: `.data/aep-auth-users.json` and `.data/aep-auth-sessions.json`.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { StoredUser } from "@/services/auth/store";
import type { SessionRecord } from "@/types";

const USER_FILE = path.join(dataDir(), "aep-auth-users.json");
const SESSION_FILE = path.join(dataDir(), "aep-auth-sessions.json");
const USER_TABLE = "aep_auth_users";
const SESSION_TABLE = "aep_auth_sessions";

type UserFile = { users: StoredUser[] };
type SessionFile = { sessions: SessionRecord[] };

let tablesReady = false;
let userIndex: {
  byId: Map<string, StoredUser>;
  byEmail: Map<string, StoredUser>;
  byPhone: Map<string, StoredUser>;
  byRole: Map<string, StoredUser[]>;
} | null = null;
let sessionIndex: {
  byId: Map<string, SessionRecord>;
  byUser: Map<string, SessionRecord[]>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asUser(row: unknown): StoredUser | null {
  if (!row || typeof row !== "object") return null;
  const value = row as StoredUser;
  if (!value.id || !value.email) return null;
  return {
    ...value,
    phone: value.phone ?? null,
    countryCode: value.countryCode ?? null,
    nationality: value.nationality ?? null,
    dateOfBirth: value.dateOfBirth ?? null,
    gender: value.gender ?? null,
    city: value.city ?? null,
    bio: value.bio ?? null,
    emergencyContactName: value.emergencyContactName ?? null,
    emergencyContactPhone: value.emergencyContactPhone ?? null,
    avatarUrl: value.avatarUrl ?? null,
    timezone: value.timezone || "UTC",
    language: value.language || "en",
    mustChangePassword: Boolean(value.mustChangePassword),
  };
}

function asSession(row: unknown): SessionRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as SessionRecord;
  if (!value.id || !value.userId || !value.tokenHash) return null;
  return {
    ...value,
    deviceFingerprint: value.deviceFingerprint ?? null,
    deviceLabel: value.deviceLabel ?? null,
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
    CREATE TABLE IF NOT EXISTS ${USER_TABLE} (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_auth_users_email_idx ON ${USER_TABLE} (email)`);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_auth_users_role_idx ON ${USER_TABLE} (role)`);
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`CREATE INDEX IF NOT EXISTS aep_auth_sessions_user_idx ON ${SESSION_TABLE} (user_id)`);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_auth_sessions_token_idx ON ${SESSION_TABLE} (token_hash)`,
  );
  tablesReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildUserIndex(rows: StoredUser[]): void {
  const byId = new Map<string, StoredUser>();
  const byEmail = new Map<string, StoredUser>();
  const byPhone = new Map<string, StoredUser>();
  const byRole = new Map<string, StoredUser[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    byEmail.set(row.email.toLowerCase(), row);
    if (row.phone) byPhone.set(row.phone.replace(/\s+/g, ""), row);
    pushMap(byRole, row.role, row);
  }
  userIndex = { byId, byEmail, byPhone, byRole };
}

function rebuildSessionIndex(rows: SessionRecord[]): void {
  const byId = new Map<string, SessionRecord>();
  const byUser = new Map<string, SessionRecord[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byUser, row.userId, row);
  }
  sessionIndex = { byId, byUser };
}

function readUserRows(): StoredUser[] {
  const file = readJsonFile<UserFile>(USER_FILE, () => ({ users: [] }));
  const rows = (file.users ?? []).map(asUser).filter(Boolean) as StoredUser[];
  if (!userIndex) rebuildUserIndex(rows);
  return rows;
}

function readSessionRows(): SessionRecord[] {
  const file = readJsonFile<SessionFile>(SESSION_FILE, () => ({ sessions: [] }));
  const rows = (file.sessions ?? []).map(asSession).filter(Boolean) as SessionRecord[];
  if (!sessionIndex) rebuildSessionIndex(rows);
  return rows;
}

function ensureUserIndex() {
  if (!userIndex) readUserRows();
  return userIndex!;
}

function writeUserRows(rows: StoredUser[]): void {
  rebuildUserIndex(rows);
  writeJsonFile(USER_FILE, { users: rows });
}

function writeSessionRows(rows: SessionRecord[]): void {
  rebuildSessionIndex(rows);
  writeJsonFile(SESSION_FILE, { sessions: rows });
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

export function getUserById(id: string): StoredUser | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${USER_TABLE} WHERE id = $1`, [
      id,
    ]);
    return payloadFromSql(rows[0] ?? {}, asUser);
  }
  return ensureUserIndex().byId.get(id) ?? null;
}

export function getUserByEmail(email: string): StoredUser | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${USER_TABLE} WHERE email = $1`,
      [normalized],
    );
    return payloadFromSql(rows[0] ?? {}, asUser);
  }
  return ensureUserIndex().byEmail.get(normalized) ?? null;
}

export function getUserByPhone(phone: string): StoredUser | null {
  const normalized = phone.replace(/\s+/g, "");
  if (!normalized) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${USER_TABLE} WHERE payload->>'phone' = $1`,
      [normalized],
    );
    return payloadFromSql(rows[0] ?? {}, asUser);
  }
  return ensureUserIndex().byPhone.get(normalized) ?? null;
}

export function listUsersByRole(role: string): StoredUser[] {
  if (!role) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${USER_TABLE} WHERE role = $1`, [
      role,
    ])
      .map((row) => payloadFromSql(row, asUser))
      .filter(Boolean) as StoredUser[];
  }
  return [...(ensureUserIndex().byRole.get(role) ?? [])];
}

export function listAllUsers(): StoredUser[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${USER_TABLE}`)
      .map((row) => payloadFromSql(row, asUser))
      .filter(Boolean) as StoredUser[];
  }
  return [...readUserRows()];
}

export function upsertUser(item: StoredUser): void {
  const row = asUser(item);
  if (!row) return;
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${USER_TABLE} (id, email, role, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [row.id, row.email.toLowerCase(), row.role, JSON.stringify(row)],
    );
    return;
  }
  const rows = readUserRows();
  const index = rows.findIndex((entry) => entry.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.unshift(row);
  writeUserRows(rows);
}

export function replaceAllUsers(rows: StoredUser[]): void {
  const next = uniqueById(rows.map(asUser).filter(Boolean) as StoredUser[]);
  if (sqlEnabled()) {
    ensureSqlTables();
    // Upsert only — never DELETE the identity table. A partial in-memory
    // list (demo seed, failed read, isolate race) must not wipe paid students.
    for (const row of next) {
      upsertUser(row);
    }
    return;
  }
  writeUserRows(next);
}

export function getSessionById(id: string): SessionRecord | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SESSION_TABLE} WHERE id = $1`,
      [id],
    );
    return payloadFromSql(rows[0] ?? {}, asSession);
  }
  return (sessionIndex ?? (readSessionRows(), sessionIndex!)).byId.get(id) ?? null;
}

export function listSessionsForUser(userId: string): SessionRecord[] {
  if (!userId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SESSION_TABLE} WHERE user_id = $1`,
      [userId],
    )
      .map((row) => payloadFromSql(row, asSession))
      .filter(Boolean) as SessionRecord[];
  }
  return [...((sessionIndex ?? (readSessionRows(), sessionIndex!)).byUser.get(userId) ?? [])];
}

export function listAllSessions(): SessionRecord[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${SESSION_TABLE}`)
      .map((row) => payloadFromSql(row, asSession))
      .filter(Boolean) as SessionRecord[];
  }
  return [...readSessionRows()];
}

export function upsertSession(item: SessionRecord): void {
  const row = asSession(item);
  if (!row) return;
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${SESSION_TABLE} (id, user_id, token_hash, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         token_hash = EXCLUDED.token_hash,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [row.id, row.userId, row.tokenHash, JSON.stringify(row)],
    );
    return;
  }
  const rows = readSessionRows();
  const index = rows.findIndex((entry) => entry.id === row.id);
  if (index >= 0) rows[index] = row;
  else rows.unshift(row);
  writeSessionRows(rows);
}

export function replaceAllSessions(rows: SessionRecord[]): void {
  const next = uniqueById(rows.map(asSession).filter(Boolean) as SessionRecord[]);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${SESSION_TABLE}`);
    chunkInsert(
      SESSION_TABLE,
      "id, user_id, token_hash, payload",
      4,
      next.map((row) => [row.id, row.userId, row.tokenHash, JSON.stringify(row)]),
      `user_id = EXCLUDED.user_id,
       token_hash = EXCLUDED.token_hash,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeSessionRows(next);
}

/** Tests only. */
export function resetAuthIdentityStoreRuntime(): void {
  tablesReady = false;
  userIndex = null;
  sessionIndex = null;
}
