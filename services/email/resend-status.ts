/**
 * Resend domain / sender verification (server-only).
 *
 * Resend's GET /domains list does not include DNS records. Records come from
 * GET /domains/{id}. Verification is POST /domains/{id}/verify.
 */

import { type ResendDomainRecord } from "@/services/email/resend-dns";

export type { ResendDomainRecord };
export {
  registrarHost,
  formatDnsRecordLine,
  formatNamecheapTsv,
} from "@/services/email/resend-dns";

export interface ResendDeliveryStatus {
  configured: boolean;
  apiReachable: boolean;
  senderEmail: string;
  senderDomain: string;
  domainId: string | null;
  domainStatus: string | null;
  domainVerified: boolean;
  region: string | null;
  records: ResendDomainRecord[];
  error: string | null;
  checkedAt: string;
}

type ResendDomainListItem = {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: ResendDomainRecord[];
};

function senderDomainFrom(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : "";
}

export function getSenderDomain(senderEmail: string): string {
  return senderDomainFrom(senderEmail);
}

function emptyStatus(input: {
  configured: boolean;
  apiReachable: boolean;
  senderEmail: string;
  senderDomain: string;
  error: string | null;
  checkedAt: string;
}): ResendDeliveryStatus {
  return {
    ...input,
    domainId: null,
    domainStatus: null,
    domainVerified: false,
    region: null,
    records: [],
  };
}

function isVerifiedStatus(status: string | undefined): boolean {
  return Boolean(status && /verified|success/i.test(status));
}

function parseRecords(raw: unknown): ResendDomainRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: ResendDomainRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? "").trim();
    const name = String(row.name ?? "").trim();
    const value = String(row.value ?? "").trim();
    if (!type || !name || !value) continue;
    const parsed: ResendDomainRecord = {
      record: String(row.record ?? type),
      name,
      type,
      value,
    };
    if (row.status != null) parsed.status = String(row.status);
    if (row.ttl != null) parsed.ttl = String(row.ttl);
    if (typeof row.priority === "number" || typeof row.priority === "string") {
      parsed.priority = row.priority;
    }
    records.push(parsed);
  }
  return records;
}

async function fetchResendJson(
  key: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

async function fetchDomainDetail(
  key: string,
  domainId: string,
): Promise<{ records: ResendDomainRecord[]; status: string | null; region: string | null }> {
  const detail = await fetchResendJson(key, `/domains/${encodeURIComponent(domainId)}`);
  if (!detail.ok) {
    return { records: [], status: null, region: null };
  }
  return {
    records: parseRecords(detail.json.records),
    status: typeof detail.json.status === "string" ? detail.json.status : null,
    region: typeof detail.json.region === "string" ? detail.json.region : null,
  };
}

function matchSenderDomain(
  domains: ResendDomainListItem[],
  senderDomain: string,
): ResendDomainListItem | null {
  return (
    domains.find((d) => d.name.toLowerCase() === senderDomain) ??
    domains.find((d) => senderDomain.endsWith(`.${d.name.toLowerCase()}`)) ??
    null
  );
}

export async function inspectResendDelivery(input: {
  senderEmail: string;
}): Promise<ResendDeliveryStatus> {
  const key = process.env.RESEND_API_KEY?.trim();
  const senderEmail = input.senderEmail.trim();
  const senderDomain = senderDomainFrom(senderEmail);
  const checkedAt = new Date().toISOString();

  if (!key) {
    return emptyStatus({
      configured: false,
      apiReachable: false,
      senderEmail,
      senderDomain,
      error: "RESEND_API_KEY is not set",
      checkedAt,
    });
  }

  try {
    const list = await fetchResendJson(key, "/domains");
    if (!list.ok) {
      return emptyStatus({
        configured: true,
        apiReachable: list.status !== 401,
        senderEmail,
        senderDomain,
        error:
          (typeof list.json.message === "string" && list.json.message) ||
          `Resend domains HTTP ${list.status}`,
        checkedAt,
      });
    }

    const domains = Array.isArray(list.json.data) ? (list.json.data as ResendDomainListItem[]) : [];
    const match = matchSenderDomain(domains, senderDomain);
    if (!match) {
      return emptyStatus({
        configured: true,
        apiReachable: true,
        senderEmail,
        senderDomain,
        error: `The ${senderDomain} domain is not verified. Add and verify it on https://resend.com/domains`,
        checkedAt,
      });
    }

    const detail = await fetchDomainDetail(key, match.id);
    const status = detail.status ?? match.status;
    const verified = isVerifiedStatus(status);
    const records = detail.records.length > 0 ? detail.records : parseRecords(match.records);

    return {
      configured: true,
      apiReachable: true,
      senderEmail,
      senderDomain,
      domainId: match.id,
      domainStatus: status,
      domainVerified: verified,
      region: detail.region ?? match.region ?? null,
      records,
      error: verified
        ? null
        : `Resend domain ${senderDomain} status=${status}. Copy the DNS records into the zone editor shown below (cPanel Zone Editor when nameservers are namecheaphosting), then click Verify DNS.`,
      checkedAt,
    };
  } catch (error) {
    return emptyStatus({
      configured: true,
      apiReachable: false,
      senderEmail,
      senderDomain,
      error: error instanceof Error ? error.message : "Resend API unreachable",
      checkedAt,
    });
  }
}

/** Register the sender domain with Resend so DNS records become available. */
export async function registerResendDomain(domain: string): Promise<{
  ok: boolean;
  domainId?: string;
  error?: string;
}> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const name = domain.trim().toLowerCase();
  if (!name) return { ok: false, error: "Domain is required" };

  const res = await fetchResendJson(key, "/domains", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok && res.status !== 409) {
    return {
      ok: false,
      error:
        (typeof res.json.message === "string" && res.json.message) || `Resend HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    domainId: typeof res.json.id === "string" ? res.json.id : undefined,
  };
}

/** Ask Resend to re-check DNS after records are added at the registrar. */
export async function verifyResendDomain(domainId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const id = domainId.trim();
  if (!id) return { ok: false, error: "Domain id is required" };

  const res = await fetchResendJson(key, `/domains/${encodeURIComponent(id)}/verify`, {
    method: "POST",
  });
  if (!res.ok) {
    return {
      ok: false,
      error:
        (typeof res.json.message === "string" && res.json.message) ||
        `Resend verify HTTP ${res.status}`,
    };
  }
  return { ok: true };
}
