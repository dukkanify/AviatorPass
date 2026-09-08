/**
 * Resend domain / sender verification (server-only).
 */

export interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status?: string;
  ttl?: string;
}

export interface ResendDeliveryStatus {
  configured: boolean;
  apiReachable: boolean;
  senderEmail: string;
  senderDomain: string;
  domainId: string | null;
  domainVerified: boolean;
  region: string | null;
  records: ResendDomainRecord[];
  error: string | null;
  checkedAt: string;
}

function senderDomainFrom(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

export function getSenderDomain(senderEmail: string): string {
  return senderDomainFrom(senderEmail);
}

export async function inspectResendDelivery(input: {
  senderEmail: string;
}): Promise<ResendDeliveryStatus> {
  const key = process.env.RESEND_API_KEY?.trim();
  const senderEmail = input.senderEmail.trim();
  const senderDomain = senderDomainFrom(senderEmail);
  const checkedAt = new Date().toISOString();

  if (!key) {
    return {
      configured: false,
      apiReachable: false,
      senderEmail,
      senderDomain,
      domainId: null,
      domainVerified: false,
      region: null,
      records: [],
      error: "RESEND_API_KEY is not set",
      checkedAt,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        id: string;
        name: string;
        status: string;
        region?: string;
        records?: ResendDomainRecord[];
      }>;
      message?: string;
    };
    if (!res.ok) {
      return {
        configured: true,
        apiReachable: res.status !== 401,
        senderEmail,
        senderDomain,
        domainId: null,
        domainVerified: false,
        region: null,
        records: [],
        error: json.message || `Resend domains HTTP ${res.status}`,
        checkedAt,
      };
    }

    const domains = json.data ?? [];
    const match =
      domains.find((d) => d.name.toLowerCase() === senderDomain) ??
      domains.find((d) => senderDomain.endsWith(`.${d.name.toLowerCase()}`)) ??
      null;
    const verified = Boolean(match && /verified|success/i.test(match.status));

    return {
      configured: true,
      apiReachable: true,
      senderEmail,
      senderDomain,
      domainId: match?.id ?? null,
      domainVerified: verified,
      region: match?.region ?? null,
      records: match?.records ?? [],
      error: match
        ? verified
          ? null
          : `Resend domain ${senderDomain} status=${match.status}. Add the DNS records at your registrar, then click Verify in Resend.`
        : `The ${senderDomain} domain is not verified. Add and verify it on https://resend.com/domains`,
      checkedAt,
    };
  } catch (error) {
    return {
      configured: true,
      apiReachable: false,
      senderEmail,
      senderDomain,
      domainId: null,
      domainVerified: false,
      region: null,
      records: [],
      error: error instanceof Error ? error.message : "Resend API unreachable",
      checkedAt,
    };
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

  const res = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok && res.status !== 409) {
    return { ok: false, error: json.message || `Resend HTTP ${res.status}` };
  }
  return { ok: true, domainId: json.id };
}
