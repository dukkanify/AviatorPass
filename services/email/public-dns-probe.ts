/**
 * Public DNS probe for Resend records (server-only).
 *
 * AviatorPass.com uses Namecheap *hosting* nameservers
 * (dns1.namecheaphosting.com). Records must go in cPanel Zone Editor.
 * Namecheap Domain List → Advanced DNS will not publish.
 */

import {
  dnsRecordFqdn,
  registrarHost,
  probeRowState,
  type DnsEditorHint,
  type PublicDnsProbe,
  type PublicDnsProbeRow,
  type ResendDomainRecord,
} from "@/services/email/resend-dns";

export { probeRowState };
export type {
  DnsEditorHint,
  DnsEditorKind,
  PublicDnsProbe,
  PublicDnsProbeRow,
} from "@/services/email/resend-dns";

export interface DnsLookup {
  resolveNs(name: string): Promise<string[]>;
  resolveMx(name: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase();
}

function emptyOnMiss(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  return /ENOTFOUND|ENODATA|ENONAME|ESERVFAIL|ETIMEOUT/i.test(code);
}

export function inferDnsEditor(nameservers: string[]): DnsEditorHint {
  const ns = nameservers.map(normalizeName).filter(Boolean);
  if (ns.some((name) => name.includes("namecheaphosting.com"))) {
    return {
      kind: "cpanel_zone_editor",
      title: "cPanel Zone Editor",
      nameservers: ns,
      instruction:
        "Add these records in cPanel → Zone Editor. The domain uses dns1.namecheaphosting.com / dns2.namecheaphosting.com. Do not use Namecheap Domain List → Advanced DNS — those records will not publish. If Host send is still a leftover CNAME, delete that CNAME before adding Resend MX/TXT.",
    };
  }
  if (ns.some((name) => name.includes("registrar-servers.com") || name.endsWith("namecheap.com"))) {
    return {
      kind: "namecheap_advanced_dns",
      title: "Namecheap Advanced DNS",
      nameservers: ns,
      instruction:
        "Add these records in Namecheap → Domain List → Manage → Advanced DNS (Type / Host / Value / TTL / Priority).",
    };
  }
  return {
    kind: "unknown",
    title: "DNS zone editor",
    nameservers: ns,
    instruction: ns.length
      ? `Add these records at the DNS host that serves ${ns.join(", ")}.`
      : "Add these records at the DNS host for this domain, then click Verify DNS.",
  };
}

/** Well-known Resend hosts used when the API has not returned records yet. */
export function fallbackResendRecords(): ResendDomainRecord[] {
  return [
    {
      record: "SPF",
      name: "send",
      type: "MX",
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
      ttl: "14400",
    },
    {
      record: "SPF",
      name: "send",
      type: "TXT",
      value: "v=spf1 include:amazonses.com ~all",
      ttl: "14400",
    },
    {
      record: "DKIM",
      name: "resend._domainkey",
      type: "TXT",
      value: "v=DKIM1",
      ttl: "14400",
    },
  ];
}

export function valuesMatch(type: string, expected: string, published: string[]): boolean {
  const exp = normalizeValue(expected);
  if (!exp) return published.length > 0;
  return published.some((item) => {
    const got = normalizeValue(item);
    if (got === exp) return true;
    if (/txt|cname/i.test(type) && (got.includes(exp) || exp.includes(got))) return true;
    return false;
  });
}

async function lookupPublished(
  lookup: DnsLookup,
  type: string,
  fqdn: string,
): Promise<{ published: string[]; error?: string }> {
  try {
    if (/mx/i.test(type)) {
      const rows = await lookup.resolveMx(fqdn);
      return {
        published: rows.map((row) => `${row.priority} ${normalizeName(row.exchange)}`.trim()),
      };
    }
    if (/cname/i.test(type)) {
      const rows = await lookup.resolveCname(fqdn);
      return { published: rows.map(normalizeName) };
    }
    const rows = await lookup.resolveTxt(fqdn);
    return { published: rows.map((chunks) => chunks.join("")) };
  } catch (error) {
    if (emptyOnMiss(error)) return { published: [] };
    return {
      published: [],
      error: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
}

export async function createNodeDnsLookup(): Promise<DnsLookup> {
  const dns = await import("node:dns/promises");
  return {
    resolveNs: (name) => dns.resolveNs(name),
    resolveMx: (name) => dns.resolveMx(name),
    resolveTxt: (name) => dns.resolveTxt(name),
    resolveCname: (name) => dns.resolveCname(name),
  };
}

export async function probePublicDns(input: {
  domain: string;
  records?: ResendDomainRecord[];
  lookup: DnsLookup;
  checkedAt?: string;
}): Promise<PublicDnsProbe> {
  const domain = normalizeName(input.domain);
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const records =
    input.records && input.records.length > 0 ? input.records : fallbackResendRecords();

  let nameservers: string[] = [];
  try {
    nameservers = (await input.lookup.resolveNs(domain)).map(normalizeName);
  } catch {
    nameservers = [];
  }

  const editor = inferDnsEditor(nameservers);
  const rows: PublicDnsProbeRow[] = [];

  for (const row of records) {
    const host = registrarHost(row.name, domain);
    const fqdn = dnsRecordFqdn(row.name, domain);
    const priority =
      row.priority !== undefined && row.priority !== "" ? String(row.priority) : undefined;
    const looked = await lookupPublished(input.lookup, row.type, fqdn);
    const expectedForMatch = /mx/i.test(row.type)
      ? [priority, row.value].filter(Boolean).join(" ")
      : row.value;
    rows.push({
      type: row.type,
      host,
      fqdn,
      expected: row.value,
      ...(priority ? { priority } : {}),
      published: looked.published,
      matched: valuesMatch(row.type, expectedForMatch, looked.published),
      ...(looked.error ? { error: looked.error } : {}),
    });
  }

  const publishedCount = rows.filter((row) => row.matched).length;
  let leftoverSendCname: string | null = null;
  try {
    const cnames = await input.lookup.resolveCname(`send.${domain}`);
    leftoverSendCname = cnames.map(normalizeName).find(Boolean) ?? null;
  } catch (error) {
    if (!emptyOnMiss(error)) leftoverSendCname = null;
  }

  return {
    domain,
    nameservers,
    editor,
    rows,
    publishedCount,
    missingCount: rows.length - publishedCount,
    checkedAt,
    leftoverSendCname,
  };
}
