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
