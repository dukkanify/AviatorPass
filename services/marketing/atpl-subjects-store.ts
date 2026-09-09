/**
 * ATPL landing subjects store (.data/aep-atpl-marketing.json).
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import { generateId, stableId } from "@/lib/security/crypto";
import {
  DEFAULT_ATPL_SUBJECT_BADGE,
  OFFICIAL_ATPL_SUBJECTS,
} from "@/services/marketing/atpl-subjects-seed";
import type { AtplLandingSubject } from "@/types/atpl-subjects";

export interface AtplMarketingDatabase {
  subjects: AtplLandingSubject[];
  seeded: boolean;
}

const DATA_FILE = path.join(dataDir(), "aep-atpl-marketing.json");

function emptyDb(): AtplMarketingDatabase {
  return { subjects: [], seeded: false };
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSubject(row: AtplLandingSubject, index: number): AtplLandingSubject {
  return {
    ...row,
    id: row.id || generateId(),
    code: typeof row.code === "string" ? row.code.trim() : "",
    title: row.title?.trim() || "Untitled subject",
    shortDescription: row.shortDescription ?? "",
    badgeLabel: row.badgeLabel?.trim() || DEFAULT_ATPL_SUBJECT_BADGE,
    imageUrl: row.imageUrl || null,
    sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : index,
    visible: row.visible !== false,
    createdAt: row.createdAt || nowIso(),
    updatedAt: row.updatedAt || row.createdAt || nowIso(),
  };
}

function seedSubjects(): AtplLandingSubject[] {
  const ts = nowIso();
  return OFFICIAL_ATPL_SUBJECTS.map((item, index) => ({
    id: stableId("atpl-subject", item.code || item.title),
    code: item.code,
    title: item.title,
    shortDescription: item.shortDescription,
    badgeLabel: DEFAULT_ATPL_SUBJECT_BADGE,
    imageUrl: null,
    sortOrder: index,
    visible: true,
    createdAt: ts,
    updatedAt: ts,
  }));
}

export function readAtplMarketingDb(): AtplMarketingDatabase {
  const db = readJsonFile<AtplMarketingDatabase>(DATA_FILE, emptyDb);
  if (!Array.isArray(db.subjects)) db.subjects = [];
  if (!db.seeded && db.subjects.length === 0) {
    db.subjects = seedSubjects();
    db.seeded = true;
    writeJsonFile(DATA_FILE, db);
    return db;
  }
  db.subjects = db.subjects.map(normalizeSubject);
  db.seeded = true;
  return db;
}

export function writeAtplMarketingDb(
  mutator: (db: AtplMarketingDatabase) => void,
): AtplMarketingDatabase {
  const db = readAtplMarketingDb();
  mutator(db);
  db.subjects = db.subjects.map(normalizeSubject);
  writeJsonFile(DATA_FILE, db);
  return db;
}

export function resetAtplMarketingDbForTests(): void {
  writeJsonFile(DATA_FILE, { subjects: seedSubjects(), seeded: true });
}
