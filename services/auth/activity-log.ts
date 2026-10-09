import { generateId } from "@/lib/security/crypto";
import type { ActivityLogRecord, AuditLogRecord } from "@/types";
import type { ActivityAction } from "@/constants/activity-actions";
import {
  AUTH_LOG_CAP,
  writeAuthDb,
  readAuthDb,
  findUserById,
  toUserProfile,
} from "@/services/auth/store";
import { locationFromParts, parseUserAgent } from "@/lib/ops/client-telemetry";
import { currentRequestContext } from "@/lib/ops/request-als";

export { AUTH_LOG_CAP };

export async function logActivity(input: {
  actorId: string | null;
  action: ActivityAction | string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ActivityLogRecord> {
  const bound = currentRequestContext();
  const ipAddress = input.ipAddress ?? bound?.ipAddress ?? null;
  const userAgent = input.userAgent ?? bound?.userAgent ?? null;
  const record: ActivityLogRecord = {
    id: generateId(),
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      city: bound?.city ?? null,
      region: bound?.region ?? null,
      country: bound?.country ?? null,
    },
    ipAddress,
    userAgent,
    createdAt: new Date().toISOString(),
  };

  writeAuthDb((db) => {
    db.activityLogs.unshift(record);
    if (db.activityLogs.length > AUTH_LOG_CAP) {
      db.activityLogs = db.activityLogs.slice(0, AUTH_LOG_CAP);
    }
  });

  return record;
}

export async function logAudit(input: {
  actorId: string | null;
  action: string;
  resource: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AuditLogRecord> {
  const record: AuditLogRecord = {
    id: generateId(),
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: new Date().toISOString(),
  };

  writeAuthDb((db) => {
    db.auditLogs.unshift(record);
    if (db.auditLogs.length > AUTH_LOG_CAP) {
      db.auditLogs = db.auditLogs.slice(0, AUTH_LOG_CAP);
    }
  });

  return record;
}

export interface ActivityLogView extends ActivityLogRecord {
  actorName: string | null;
  actorEmail: string | null;
  device: string;
  browser: string;
  os: string;
  location: string;
}

function enrichActivityLog(log: ActivityLogRecord): ActivityLogView {
  const actor = log.actorId ? findUserById(log.actorId) : null;
  const profile = actor ? toUserProfile(actor) : null;
  const ua = parseUserAgent(log.userAgent);
  const meta = log.metadata ?? {};
  const location = locationFromParts({
    city: typeof meta.city === "string" ? meta.city : null,
    region: typeof meta.region === "string" ? meta.region : null,
    country: typeof meta.country === "string" ? meta.country : null,
  });
  return {
    ...log,
    actorName:
      profile?.fullName || profile?.email || (log.actorId ? log.actorId.slice(0, 8) : null),
    actorEmail: profile?.email ?? null,
    device: ua.device,
    browser: ua.browser,
    os: ua.os,
    location: location.label,
  };
}

export function listActivityLogs(options?: { page?: number; pageSize?: number; action?: string }): {
  data: ActivityLogView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 25;
  const db = readAuthDb();
  let rows = db.activityLogs;
  if (options?.action) {
    rows = rows.filter((r) => r.action === options.action);
  }
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize).map(enrichActivityLog),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
