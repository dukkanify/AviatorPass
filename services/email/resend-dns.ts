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

/**
 * Namecheap / typical registrar Host: strip the apex domain so staff paste
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

export function formatDnsRecordLine(row: ResendDomainRecord, domain: string): string {
  const host = registrarHost(row.name, domain);
  const priority = row.priority !== undefined && row.priority !== "" ? String(row.priority) : "";
  const parts = [row.type, host];
  if (priority && /mx/i.test(row.type)) parts.push(priority);
  parts.push(row.value);
  if (row.status) parts.push(`(${row.status})`);
  return parts.join(" ");
}
