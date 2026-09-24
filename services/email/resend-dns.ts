/**
 * Resend DNS record helpers — safe for client and server.
 */

export interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status?: string;
  ttl?: string;
  priority?: number | string;
}

export type DnsEditorKind = "cpanel_zone_editor" | "namecheap_advanced_dns" | "unknown";

export interface DnsEditorHint {
  kind: DnsEditorKind;
  title: string;
  nameservers: string[];
  instruction: string;
}

export interface PublicDnsProbeRow {
  type: string;
  host: string;
  fqdn: string;
  expected: string;
  priority?: string;
  published: string[];
  matched: boolean;
  error?: string;
}

export interface PublicDnsProbe {
  domain: string;
  nameservers: string[];
  editor: DnsEditorHint;
  rows: PublicDnsProbeRow[];
  publishedCount: number;
  missingCount: number;
  checkedAt: string;
  /** Leftover CNAME on Host `send` — must be deleted before Resend MX/TXT can publish. */
  leftoverSendCname: string | null;
}

/** cPanel Zone Editor steps when Host `send` is still a Forge / non-Resend CNAME. */
export function leftoverSendCnameInstruction(cname: string): string {
  const host = cname.trim().replace(/\.$/, "") || "the current CNAME target";
  return (
    `Delete leftover CNAME Host send → ${host} first. ` +
    "A hostname cannot be CNAME and MX/TXT at the same time. " +
    "Then add MX Host send Priority 10 → feedback-smtp.us-east-1.amazonses.com " +
    "and TXT Host send → v=spf1 include:amazonses.com ~all. " +
    "Keep resend._domainkey and the apex mailbox SPF."
  );
}

/** cPanel / Namecheap hosting default when Resend prints "Auto". */
export const CPANEL_DEFAULT_TTL = "14400";

/**
 * Namecheap / cPanel Host: strip the apex domain so staff paste
 * `send` not `send.aviatorpass.com`. Apex itself becomes `@`.
 */
export function registrarHost(name: string, domain: string): string {
  const raw = name.trim();
  const n = raw.replace(/\.$/, "").toLowerCase();
  const d = domain.trim().replace(/\.$/, "").toLowerCase();
  if (!n || n === "@" || n === d) return "@";
  if (d && n.endsWith(`.${d}`)) {
    const host = n.slice(0, n.length - d.length - 1);
    return host || "@";
  }
  return raw;
}

export function dnsRecordFqdn(name: string, domain: string): string {
  const host = registrarHost(name, domain);
  const apex = domain.trim().replace(/\.$/, "").toLowerCase();
  if (!apex) return host === "@" ? "" : host;
  return host === "@" ? apex : `${host}.${apex}`;
}

export function zoneTtl(ttl?: string): string {
  const raw = (ttl ?? "").trim();
  if (!raw || /^auto$/i.test(raw)) return CPANEL_DEFAULT_TTL;
  return raw;
}

export function formatDnsRecordLine(row: ResendDomainRecord, domain: string): string {
  const host = registrarHost(row.name, domain);
  const priority = row.priority !== undefined && row.priority !== "" ? String(row.priority) : "";
  const parts = [row.type, host];
  if (priority && /mx/i.test(row.type)) parts.push(priority);
  parts.push(row.value);
  if (row.status) parts.push(`(${row.status})`);
  return parts.join(" ");
}

/** Public DNS vs Resend expected: exact match, wrong published value, or empty. */
export function probeRowState(row: {
  matched: boolean;
  published: string[];
}): "published" | "mismatch" | "missing" {
  if (row.matched) return "published";
  if (row.published.length > 0) return "mismatch";
  return "missing";
}

/**
 * Tab-separated paste sheet for cPanel Zone Editor / Namecheap Advanced DNS.
 * Columns match the hosting UI: Type, Host, Value, TTL, Priority.
 */
export function formatNamecheapTsv(records: ResendDomainRecord[], domain: string): string {
  const header = ["Type", "Host", "Value", "TTL", "Priority"].join("\t");
  const lines = records.map((row) => {
    const host = registrarHost(row.name, domain);
    const priority =
      /mx/i.test(row.type) && row.priority !== undefined && row.priority !== ""
        ? String(row.priority)
        : "";
    return [row.type.toUpperCase(), host, row.value, zoneTtl(row.ttl), priority].join("\t");
  });
  return [header, ...lines].join("\n");
}
