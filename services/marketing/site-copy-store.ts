/**
 * Site copy overrides store (.data/aep-site-copy.json).
 */

import path from "path";

import {
  clearJsonFileCache,
  dataDir,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import type { SiteCopyDatabase, SiteCopyPageId, SiteCopyPageOverrides } from "@/types/site-copy";

const DATA_FILE = path.join(dataDir(), "aep-site-copy.json");

function emptyDb(): SiteCopyDatabase {
  return { pages: {}, updatedAt: null };
}

function normalizeOverrides(raw: unknown): SiteCopyPageOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: SiteCopyPageOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = value;
  }
  return out;
}

export function readSiteCopyDb(): SiteCopyDatabase {
  const raw = readJsonFile<Partial<SiteCopyDatabase>>(DATA_FILE, emptyDb);
  const pages: SiteCopyDatabase["pages"] = {};
  if (raw.pages && typeof raw.pages === "object") {
    for (const [pageId, overrides] of Object.entries(raw.pages)) {
      pages[pageId as SiteCopyPageId] = normalizeOverrides(overrides);
    }
  }
  return {
    pages,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export function writeSiteCopyDb(db: SiteCopyDatabase): void {
  writeJsonFile(DATA_FILE, {
    pages: db.pages,
    updatedAt: db.updatedAt ?? new Date().toISOString(),
  });
}

export function resetSiteCopyDbForTests(): void {
  clearJsonFileCache(DATA_FILE);
  writeJsonFile(DATA_FILE, emptyDb());
}
