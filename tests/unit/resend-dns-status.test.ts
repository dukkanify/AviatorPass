/**
 * Resend DNS inspect / verify — mocked HTTP, no live Resend calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatDnsRecordLine,
  formatNamecheapTsv,
  registrarHost,
} from "@/services/email/resend-dns";
import {
  inferDnsEditor,
  probePublicDns,
  type DnsLookup,
  valuesMatch,
} from "@/services/email/public-dns-probe";
import {
  inspectResendDelivery,
  registerResendDomain,
  verifyResendDomain,
} from "@/services/email/resend-status";

const ORIGINAL_ENV = { ...process.env };

const LIST_URL = "https://api.resend.com/domains";
const DETAIL_URL = "https://api.resend.com/domains/dom_aviatorpass";
const VERIFY_URL = "https://api.resend.com/domains/dom_aviatorpass/verify";

const DETAIL_RECORDS = [
  {
    record: "SPF",
    name: "send",
    type: "MX",
    ttl: "Auto",
    status: "not_started",
    value: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
  },
  {
    record: "SPF",
    name: "send.aviatorpass.com",
    type: "TXT",
    ttl: "Auto",
    status: "not_started",
    value: "v=spf1 include:amazonses.com ~all",
  },
  {
    record: "DKIM",
    name: "resend._domainkey",
    type: "TXT",
    ttl: "Auto",
    status: "not_started",
    value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQexample",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("registrarHost", () => {
  it("strips the apex domain for Namecheap Host fields", () => {
    expect(registrarHost("send", "aviatorpass.com")).toBe("send");
    expect(registrarHost("send.aviatorpass.com", "aviatorpass.com")).toBe("send");
    expect(registrarHost("resend._domainkey.aviatorpass.com", "aviatorpass.com")).toBe(
      "resend._domainkey",
    );
    expect(registrarHost("aviatorpass.com", "aviatorpass.com")).toBe("@");
    expect(registrarHost("@", "aviatorpass.com")).toBe("@");
  });

  it("formats a copyable MX line with Host and Priority", () => {
    expect(
      formatDnsRecordLine(
        {
          record: "SPF",
          name: "send.aviatorpass.com",
          type: "MX",
          value: "feedback-smtp.us-east-1.amazonses.com",
          priority: 10,
          status: "not_started",
        },
        "aviatorpass.com",
      ),
    ).toBe("MX send 10 feedback-smtp.us-east-1.amazonses.com (not_started)");
  });
});

describe("inspectResendDelivery", () => {
  it("loads DNS records from GET /domains/{id}, not the list payload", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === LIST_URL) {
        return jsonResponse({
          data: [
            {
              id: "dom_aviatorpass",
              name: "aviatorpass.com",
              status: "not_started",
              region: "us-east-1",
            },
          ],
        });
      }
      if (url === DETAIL_URL) {
        return jsonResponse({
          id: "dom_aviatorpass",
          name: "aviatorpass.com",
          status: "pending",
          region: "us-east-1",
          records: DETAIL_RECORDS,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await inspectResendDelivery({ senderEmail: "noreply@aviatorpass.com" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(DETAIL_URL);
    expect(status.domainId).toBe("dom_aviatorpass");
    expect(status.domainVerified).toBe(false);
    expect(status.domainStatus).toBe("pending");
    expect(status.records).toHaveLength(3);
    expect(status.records[0]?.priority).toBe(10);
    expect(status.records[0]?.value).toContain("feedback-smtp");
    expect(status.error).toMatch(/zone editor|cPanel|namecheaphosting/i);
  });

  it("treats verified domain status as complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === LIST_URL) {
          return jsonResponse({
            data: [{ id: "dom_aviatorpass", name: "aviatorpass.com", status: "verified" }],
          });
        }
        return jsonResponse({
          id: "dom_aviatorpass",
          status: "verified",
          records: DETAIL_RECORDS,
        });
      }),
    );

    const status = await inspectResendDelivery({ senderEmail: "noreply@aviatorpass.com" });
    expect(status.domainVerified).toBe(true);
    expect(status.error).toBeNull();
  });

  it("returns a missing-key error without calling Resend", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const status = await inspectResendDelivery({ senderEmail: "noreply@aviatorpass.com" });
    expect(status.configured).toBe(false);
    expect(status.error).toMatch(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("registerResendDomain / verifyResendDomain", () => {
  it("registers a domain then asks Resend to verify DNS", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === LIST_URL && (init?.method ?? "GET") === "POST") {
        return jsonResponse({ id: "dom_aviatorpass", name: "aviatorpass.com" });
      }
      if (url === VERIFY_URL && init?.method === "POST") {
        return jsonResponse({ object: "domain", id: "dom_aviatorpass" });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(registerResendDomain("aviatorpass.com")).resolves.toEqual({
      ok: true,
      domainId: "dom_aviatorpass",
    });
    await expect(verifyResendDomain("dom_aviatorpass")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an existing Resend domain (HTTP 409) as registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "already exists" }, 409)),
    );
    await expect(registerResendDomain("aviatorpass.com")).resolves.toMatchObject({ ok: true });
  });
});

describe("Namecheap / cPanel paste sheet", () => {
  it("formats Type Host Value TTL Priority TSV for Zone Editor", () => {
    expect(formatNamecheapTsv(DETAIL_RECORDS, "aviatorpass.com")).toBe(
      [
        "Type\tHost\tValue\tTTL\tPriority",
        "MX\tsend\tfeedback-smtp.us-east-1.amazonses.com\t14400\t10",
        "TXT\tsend\tv=spf1 include:amazonses.com ~all\t14400\t",
        "TXT\tresend._domainkey\tp=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQexample\t14400\t",
      ].join("\n"),
    );
  });
});

describe("public DNS probe", () => {
  function lookup(partial: Partial<DnsLookup>): DnsLookup {
    return {
      resolveNs: async () => [],
      resolveMx: async () => {
        throw Object.assign(new Error("ENODATA"), { code: "ENODATA" });
      },
      resolveTxt: async () => {
        throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      },
      resolveCname: async () => {
        throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      },
      ...partial,
    };
  }

  it("tells staff to use cPanel Zone Editor when NS are namecheaphosting", () => {
    const editor = inferDnsEditor(["dns1.namecheaphosting.com.", "dns2.namecheaphosting.com."]);
    expect(editor.kind).toBe("cpanel_zone_editor");
    expect(editor.instruction).toMatch(/Zone Editor/i);
    expect(editor.instruction).toMatch(/Do not use Namecheap Domain List/i);
  });

  it("tells staff to use Advanced DNS when NS are registrar-servers", () => {
    const editor = inferDnsEditor(["dns1.registrar-servers.com"]);
    expect(editor.kind).toBe("namecheap_advanced_dns");
  });

  it("marks Resend DKIM and send hosts missing against hosting NS", async () => {
    const probe = await probePublicDns({
      domain: "aviatorpass.com",
      records: DETAIL_RECORDS,
      lookup: lookup({
        resolveNs: async () => ["dns1.namecheaphosting.com", "dns2.namecheaphosting.com"],
      }),
      checkedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(probe.editor.kind).toBe("cpanel_zone_editor");
    expect(probe.nameservers).toEqual(["dns1.namecheaphosting.com", "dns2.namecheaphosting.com"]);
    expect(probe.publishedCount).toBe(0);
    expect(probe.missingCount).toBe(3);
    expect(probe.rows.map((row) => row.host)).toEqual(["send", "send", "resend._domainkey"]);
    expect(probe.rows.every((row) => row.matched === false)).toBe(true);
  });

  it("matches published MX and TXT values from public DNS", async () => {
    const probe = await probePublicDns({
      domain: "aviatorpass.com",
      records: DETAIL_RECORDS,
      lookup: lookup({
        resolveNs: async () => ["dns1.namecheaphosting.com"],
        resolveMx: async (name) =>
          name === "send.aviatorpass.com"
            ? [{ exchange: "feedback-smtp.us-east-1.amazonses.com.", priority: 10 }]
            : [],
        resolveTxt: async (name) => {
          if (name === "send.aviatorpass.com") return [["v=spf1 include:amazonses.com ~all"]];
          if (name === "resend._domainkey.aviatorpass.com") {
            return [["p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQexample"]];
          }
          return [];
        },
      }),
    });
    expect(probe.publishedCount).toBe(3);
    expect(probe.missingCount).toBe(0);
    expect(probe.rows.every((row) => row.matched)).toBe(true);
  });

  it("treats a DKIM public key as published when the TXT contains the expected fragment", () => {
    expect(valuesMatch("TXT", "v=DKIM1", ["v=DKIM1; k=rsa; p=MIGfMA0GCSq"])).toBe(true);
    expect(valuesMatch("TXT", "v=spf1 include:amazonses.com ~all", ["v=spf1 +a ~all"])).toBe(false);
  });
});
