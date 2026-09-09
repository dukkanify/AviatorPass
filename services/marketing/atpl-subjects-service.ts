/**
 * Super Admin CMS for ATPL landing-page subjects.
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId } from "@/lib/security/crypto";
import { logActivity, logAudit } from "@/services/auth/activity-log";
import { CourseValidationError } from "@/services/courses/validation";
import {
  readAtplMarketingDb,
  writeAtplMarketingDb,
} from "@/services/marketing/atpl-subjects-store";
import { DEFAULT_ATPL_SUBJECT_BADGE } from "@/services/marketing/atpl-subjects-seed";
import type {
  AtplLandingSubject,
  AtplLandingSubjectPublic,
  AtplLandingSubjectWrite,
} from "@/types/atpl-subjects";

type ActorCtx = {
  actorId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function sorted(rows: AtplLandingSubject[]): AtplLandingSubject[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export function listAtplLandingSubjects(options?: {
  includeHidden?: boolean;
}): AtplLandingSubject[] {
  const rows = readAtplMarketingDb().subjects;
  const filtered = options?.includeHidden ? rows : rows.filter((row) => row.visible);
  return sorted(filtered);
}

export function listPublicAtplSubjects(): AtplLandingSubjectPublic[] {
  return listAtplLandingSubjects().map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    shortDescription: row.shortDescription,
    badgeLabel: row.badgeLabel || DEFAULT_ATPL_SUBJECT_BADGE,
    imageUrl: row.imageUrl,
  }));
}

export async function createAtplLandingSubject(
  input: AtplLandingSubjectWrite,
  ctx?: ActorCtx,
): Promise<AtplLandingSubject> {
  const title = input.title?.trim();
  if (!title) throw new CourseValidationError("Course name is required");

  const ts = new Date().toISOString();
  const created: AtplLandingSubject = {
    id: generateId(),
    code: input.code?.trim() ?? "",
    title,
    shortDescription: input.shortDescription?.trim() ?? "",
    badgeLabel: input.badgeLabel?.trim() || DEFAULT_ATPL_SUBJECT_BADGE,
    imageUrl: input.imageUrl?.trim() || null,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? input.sortOrder
        : listAtplLandingSubjects({ includeHidden: true }).length,
    visible: input.visible !== false,
    createdAt: ts,
    updatedAt: ts,
  };

  writeAtplMarketingDb((db) => {
    db.subjects.push(created);
  });

  await logActivity({
    actorId: ctx?.actorId ?? null,
    action: ACTIVITY_ACTIONS.ATPL_SUBJECT_CREATED,
    entityType: "atpl_subject",
    entityId: created.id,
    metadata: { code: created.code, title: created.title },
    ipAddress: ctx?.ipAddress,
    userAgent: ctx?.userAgent,
  });
  await logAudit({
    actorId: ctx?.actorId ?? null,
    action: ACTIVITY_ACTIONS.ATPL_SUBJECT_CREATED,
    resource: `atpl_subject:${created.id}`,
    afterState: { code: created.code, title: created.title },
    ipAddress: ctx?.ipAddress,
    userAgent: ctx?.userAgent,
  });
  return created;
}

export async function updateAtplLandingSubject(
  input: {
    id: string;
    patch: Partial<AtplLandingSubjectWrite>;
  } & ActorCtx,
): Promise<AtplLandingSubject> {
  writeAtplMarketingDb((db) => {
    const row = db.subjects.find((item) => item.id === input.id);
    if (!row) throw new CourseValidationError("Subject not found");
    if (input.patch.title != null) {
      const title = input.patch.title.trim();
      if (!title) throw new CourseValidationError("Course name is required");
      row.title = title;
    }
    if (input.patch.code != null) row.code = input.patch.code.trim();
    if (input.patch.shortDescription != null) {
      row.shortDescription = input.patch.shortDescription.trim();
    }
    if (input.patch.badgeLabel != null) {
      row.badgeLabel = input.patch.badgeLabel.trim() || DEFAULT_ATPL_SUBJECT_BADGE;
    }
    if (input.patch.imageUrl !== undefined) {
      row.imageUrl = input.patch.imageUrl?.trim() || null;
    }
    if (typeof input.patch.sortOrder === "number" && Number.isFinite(input.patch.sortOrder)) {
      row.sortOrder = input.patch.sortOrder;
    }
    if (typeof input.patch.visible === "boolean") row.visible = input.patch.visible;
    row.updatedAt = new Date().toISOString();
  });
  const updated = listAtplLandingSubjects({ includeHidden: true }).find(
    (item) => item.id === input.id,
  );
  if (!updated) throw new CourseValidationError("Subject not found");

  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ATPL_SUBJECT_UPDATED,
    entityType: "atpl_subject",
    entityId: input.id,
    metadata: { title: updated.title, visible: updated.visible },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  return updated;
}

export async function deleteAtplLandingSubject(input: { id: string } & ActorCtx): Promise<void> {
  writeAtplMarketingDb((db) => {
    const next = db.subjects.filter((item) => item.id !== input.id);
    if (next.length === db.subjects.length) throw new CourseValidationError("Subject not found");
    db.subjects = next;
  });
  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ATPL_SUBJECT_DELETED,
    entityType: "atpl_subject",
    entityId: input.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function reorderAtplLandingSubjects(
  input: {
    ids: string[];
  } & ActorCtx,
): Promise<AtplLandingSubject[]> {
  if (!input.ids.length) throw new CourseValidationError("ids are required");
  writeAtplMarketingDb((db) => {
    const byId = new Map(db.subjects.map((row) => [row.id, row]));
    input.ids.forEach((id, index) => {
      const row = byId.get(id);
      if (row) {
        row.sortOrder = index;
        row.updatedAt = new Date().toISOString();
      }
    });
  });
  await logActivity({
    actorId: input.actorId ?? null,
    action: ACTIVITY_ACTIONS.ATPL_SUBJECT_REORDERED,
    entityType: "atpl_subject",
    entityId: "collection",
    metadata: { count: input.ids.length },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  return listAtplLandingSubjects({ includeHidden: true });
}
