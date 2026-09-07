/**
 * Zoom integrations durable store (.data/aep-zoom.json).
 * One connected Zoom account per instructor user.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import type { ZoomIntegrationRecord } from "@/types/zoom-oauth";

export interface ZoomOAuthPendingState {
  nonce: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  returnTo: string;
}

export interface ZoomDatabase {
  integrations: ZoomIntegrationRecord[];
  pendingStates: ZoomOAuthPendingState[];
}

function dataFile() {
  return path.join(dataDir(), "aep-zoom.json");
}

function emptyDb(): ZoomDatabase {
  return { integrations: [], pendingStates: [] };
}

function normalizeDb(raw: Partial<ZoomDatabase>): ZoomDatabase {
  return {
    integrations: raw.integrations ?? [],
    pendingStates: raw.pendingStates ?? [],
  };
}

export function readZoomDb(): ZoomDatabase {
  return normalizeDb(readJsonFile<Partial<ZoomDatabase>>(dataFile(), emptyDb));
}

export function writeZoomDb(mutator: (db: ZoomDatabase) => void): ZoomDatabase {
  const db = readZoomDb();
  mutator(db);
  writeJsonFile(dataFile(), db);
  return db;
}

export function getIntegrationByUserId(userId: string): ZoomIntegrationRecord | null {
  return readZoomDb().integrations.find((row) => row.userId === userId) ?? null;
}

export function getIntegrationByZoomUserId(zoomUserId: string): ZoomIntegrationRecord | null {
  return readZoomDb().integrations.find((row) => row.zoomUserId === zoomUserId) ?? null;
}

export function upsertIntegration(record: ZoomIntegrationRecord): ZoomIntegrationRecord {
  writeZoomDb((db) => {
    const idx = db.integrations.findIndex((row) => row.userId === record.userId);
    if (idx >= 0) db.integrations[idx] = record;
    else db.integrations.push(record);
  });
  return record;
}

export function deleteIntegrationForUser(userId: string): ZoomIntegrationRecord | null {
  const existing = getIntegrationByUserId(userId);
  if (!existing) return null;
  writeZoomDb((db) => {
    db.integrations = db.integrations.filter((row) => row.userId !== userId);
  });
  return existing;
}

export function consumePendingOAuthState(
  userId: string,
  nonce: string,
): ZoomOAuthPendingState | null {
  const existing = readZoomDb().pendingStates.find((s) => s.nonce === nonce && s.userId === userId);
  if (!existing) return null;
  writeZoomDb((db) => {
    db.pendingStates = db.pendingStates.filter((s) => !(s.nonce === nonce && s.userId === userId));
  });
  return existing;
}

export function resetZoomStoreForTests(): void {
  writeJsonFile(dataFile(), emptyDb());
}
