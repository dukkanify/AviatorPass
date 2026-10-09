/**
 * API platform durable store (Task 018).
 * Uses json-file-store so read-only hosts (Vercel) never 500 Server Components.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import type { ApiPlatformDatabase } from "@/types/api-platform";

function dataFile() {
  return path.join(dataDir(), "aep-api-platform.json");
}

function emptyDb(): ApiPlatformDatabase {
  return {
    apiKeys: [],
    refreshTokens: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    integrations: [],
    queueJobs: [],
    importJobs: [],
    exportJobs: [],
    apiLogs: [],
    cacheMeta: [],
    oauthClients: [],
    seeded: false,
  };
}

function normalizeDb(raw: Partial<ApiPlatformDatabase>): ApiPlatformDatabase {
  return {
    ...emptyDb(),
    ...raw,
    apiKeys: raw.apiKeys ?? [],
    refreshTokens: raw.refreshTokens ?? [],
    webhookEndpoints: raw.webhookEndpoints ?? [],
    webhookDeliveries: raw.webhookDeliveries ?? [],
    integrations: raw.integrations ?? [],
    queueJobs: raw.queueJobs ?? [],
    importJobs: raw.importJobs ?? [],
    exportJobs: raw.exportJobs ?? [],
    apiLogs: raw.apiLogs ?? [],
    cacheMeta: raw.cacheMeta ?? [],
    oauthClients: raw.oauthClients ?? [],
    seeded: Boolean(raw.seeded),
  };
}

export function ensureApiPlatformStore(): ApiPlatformDatabase {
  const raw = readJsonFile<Partial<ApiPlatformDatabase>>(dataFile(), emptyDb);
  const db = normalizeDb(raw);
  const trimmed =
    db.apiLogs.length > 400 || db.webhookDeliveries.length > 400 || db.queueJobs.length > 400;
  if (trimmed) writeApiPlatformStore(db);
  return db;
}

export function writeApiPlatformStore(db: ApiPlatformDatabase) {
  // Cap logs / deliveries
  if (db.apiLogs.length > 400) db.apiLogs = db.apiLogs.slice(0, 400);
  if (db.webhookDeliveries.length > 400) {
    db.webhookDeliveries = db.webhookDeliveries.slice(0, 400);
  }
  if (db.queueJobs.length > 400) db.queueJobs = db.queueJobs.slice(0, 400);
  writeJsonFile(dataFile(), db);
}
