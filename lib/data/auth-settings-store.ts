/**
 * Indexed notification preferences and security settings — never hydrate
 * the leftover auth catalog to check a lockout or load inbox prefs.
 *
 * Production: Postgres `aep_auth_notification_prefs` / `aep_auth_security_settings`.
 * Local / tests: `.data/aep-notification-prefs.json` and `.data/aep-security-settings.json`.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { NotificationPreferences, UserSecuritySettings } from "@/services/auth/store";

const PREFS_FILE = path.join(dataDir(), "aep-notification-prefs.json");
const SECURITY_FILE = path.join(dataDir(), "aep-security-settings.json");
const PREFS_TABLE = "aep_auth_notification_prefs";
const SECURITY_TABLE = "aep_auth_security_settings";

type PrefsFile = { notificationPreferences: NotificationPreferences[] };
type SecurityFile = { securitySettings: UserSecuritySettings[] };

let tablesReady = false;
let prefsByUser: Map<string, NotificationPreferences> | null = null;
let securityByUser: Map<string, UserSecuritySettings> | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function asPrefs(row: unknown): NotificationPreferences | null {
  if (!row || typeof row !== "object") return null;
  const value = row as NotificationPreferences;
  if (!value.userId) return null;
  return value;
}

function asSecurity(row: unknown): UserSecuritySettings | null {
  if (!row || typeof row !== "object") return null;
  const value = row as UserSecuritySettings;
  if (!value.userId) return null;
  return value;
}

function ensureSqlTables(): void {
  if (tablesReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${PREFS_TABLE} (
      user_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${SECURITY_TABLE} (
      user_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tablesReady = true;
}

function readPrefsRows(): NotificationPreferences[] {
  const file = readJsonFile<PrefsFile>(PREFS_FILE, () => ({ notificationPreferences: [] }));
  const rows = (file.notificationPreferences ?? [])
    .map(asPrefs)
    .filter(Boolean) as NotificationPreferences[];
  if (!prefsByUser) {
    prefsByUser = new Map(rows.map((row) => [row.userId, row]));
  }
  return rows;
}

function readSecurityRows(): UserSecuritySettings[] {
  const file = readJsonFile<SecurityFile>(SECURITY_FILE, () => ({ securitySettings: [] }));
  const rows = (file.securitySettings ?? [])
    .map(asSecurity)
    .filter(Boolean) as UserSecuritySettings[];
  if (!securityByUser) {
    securityByUser = new Map(rows.map((row) => [row.userId, row]));
  }
  return rows;
}

function writePrefsRows(rows: NotificationPreferences[]): void {
  const unique = new Map<string, NotificationPreferences>();
  for (const row of rows) {
    if (row?.userId) unique.set(row.userId, row);
  }
  const next = [...unique.values()];
  prefsByUser = unique;
  writeJsonFile(PREFS_FILE, { notificationPreferences: next });
}

function writeSecurityRows(rows: UserSecuritySettings[]): void {
  const unique = new Map<string, UserSecuritySettings>();
  for (const row of rows) {
    if (row?.userId) unique.set(row.userId, row);
  }
  const next = [...unique.values()];
  securityByUser = unique;
  writeJsonFile(SECURITY_FILE, { securitySettings: next });
}

export function getNotificationPreferencesByUser(userId: string): NotificationPreferences | null {
  if (!userId) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PREFS_TABLE} WHERE user_id = $1`,
      [userId],
    );
    return asPrefs(rows[0]?.payload ?? null);
  }
  if (!prefsByUser) readPrefsRows();
  return prefsByUser!.get(userId) ?? null;
}

export function getSecuritySettingsByUser(userId: string): UserSecuritySettings | null {
  if (!userId) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${SECURITY_TABLE} WHERE user_id = $1`,
      [userId],
    );
    return asSecurity(rows[0]?.payload ?? null);
  }
  if (!securityByUser) readSecurityRows();
  return securityByUser!.get(userId) ?? null;
}

export function listAllNotificationPreferences(): NotificationPreferences[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${PREFS_TABLE}`)
      .map((row) => asPrefs(row.payload))
      .filter(Boolean) as NotificationPreferences[];
  }
  return [...readPrefsRows()];
}

export function listAllSecuritySettings(): UserSecuritySettings[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${SECURITY_TABLE}`)
      .map((row) => asSecurity(row.payload))
      .filter(Boolean) as UserSecuritySettings[];
  }
  return [...readSecurityRows()];
}

export function upsertNotificationPreferences(item: NotificationPreferences): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${PREFS_TABLE} (user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.userId, JSON.stringify(item)],
    );
    return;
  }
  const rows = readPrefsRows();
  const index = rows.findIndex((row) => row.userId === item.userId);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writePrefsRows(rows);
}

export function upsertSecuritySettings(item: UserSecuritySettings): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${SECURITY_TABLE} (user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.userId, JSON.stringify(item)],
    );
    return;
  }
  const rows = readSecurityRows();
  const index = rows.findIndex((row) => row.userId === item.userId);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writeSecurityRows(rows);
}

export function replaceAllNotificationPreferences(rows: NotificationPreferences[]): void {
  const unique = new Map<string, NotificationPreferences>();
  for (const row of rows.map(asPrefs).filter(Boolean) as NotificationPreferences[]) {
    unique.set(row.userId, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${PREFS_TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 2;
        values.push(row.userId, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${PREFS_TABLE} (user_id, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writePrefsRows(next);
}

export function replaceAllSecuritySettings(rows: UserSecuritySettings[]): void {
  const unique = new Map<string, UserSecuritySettings>();
  for (const row of rows.map(asSecurity).filter(Boolean) as UserSecuritySettings[]) {
    unique.set(row.userId, row);
  }
  const next = [...unique.values()];
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${SECURITY_TABLE}`);
    const chunkSize = 80;
    for (let i = 0; i < next.length; i += chunkSize) {
      const chunk = next.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, offset) => {
        const base = offset * 2;
        values.push(row.userId, JSON.stringify(row));
        return `($${base + 1}, $${base + 2}::jsonb, NOW())`;
      });
      neonSql(
        `INSERT INTO ${SECURITY_TABLE} (user_id, payload, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        values,
      );
    }
    return;
  }
  writeSecurityRows(next);
}

/** Tests only. */
export function resetAuthSettingsStoreRuntime(): void {
  tablesReady = false;
  prefsByUser = null;
  securityByUser = null;
}
