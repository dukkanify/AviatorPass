/**
 * Safe Taly transport diagnostics — no live network required for shape/safety tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLoginTransportDiagnostic,
  extractTalyErrorParts,
  vercelExecutionRegion,
  writeTalyLoginTransportStderr,
} from "@/services/payments/taly-diagnostics";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("Taly transport diagnostics", () => {
  it("reads VERCEL_REGION as function execution region", () => {
    process.env.VERCEL_REGION = "iad1";
    expect(vercelExecutionRegion()).toBe("iad1");
  });

  it("extracts name/code/causeCode without leaking secrets", () => {
    const error = Object.assign(new Error("fetch failed"), {
      name: "TypeError",
      code: "ECONNRESET",
      cause: { code: "ECONNRESET", message: "socket hang up" },
    });
    expect(extractTalyErrorParts(error)).toEqual({
      name: "TypeError",
      code: "ECONNRESET",
      causeCode: "ECONNRESET",
      reason: "fetch failed",
    });
  });

  it("builds stderr-safe login diagnostic payload", () => {
    process.env.VERCEL_REGION = "iad1";
    process.env.TALY_BASE_URL = "https://api.taly.io";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.TALY_OAUTH_CLIENT_ID = "test-oauth-client";
    process.env.TALY_OAUTH_CLIENT_SECRET = "test-oauth-secret";

    const error = Object.assign(new Error("fetch failed"), {
      name: "TypeError",
      code: "UND_ERR_CONNECT_TIMEOUT",
      cause: { code: "ETIMEDOUT" },
    });

    const details = buildLoginTransportDiagnostic({
      error,
      attempt: "oauth-client-basic-form",
      durationMs: 42,
      failedAt: "2026-11-13T17:39:44.000Z",
      oauthClientFromEnv: true,
      probe: {
        baseHost: "api.taly.io",
        baseKind: "production",
        dnsOk: true,
        dnsMs: 3,
        dnsCode: null,
        tlsOk: true,
        tlsMs: 20,
        tlsCode: null,
        tlsProtocol: "TLSv1.3",
        httpsOk: false,
        httpsMs: 19,
        httpsStatus: null,
        httpsCode: "ECONNRESET",
      },
    });

    const serialized = JSON.stringify(details);
    expect(details.vercelRegion).toBe("iad1");
    expect(details.baseHost).toBe("api.taly.io");
    expect(details.baseKind).toBe("production");
    expect(details.errorName).toBe("TypeError");
    expect(details.errorCode).toBe("UND_ERR_CONNECT_TIMEOUT");
    expect(details.causeCode).toBe("ETIMEDOUT");
    expect(details.durationMs).toBe(42);
    expect(details.failedAt).toBe("2026-11-13T17:39:44.000Z");
    expect(details.symptom).toBe("timeout");
    expect(serialized).not.toMatch(/Authorization|Bearer|access_token|secret|password|Basic /i);
    expect(serialized).not.toContain("test-oauth-secret");

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeTalyLoginTransportStderr(details);
    expect(spy).toHaveBeenCalledOnce();
    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("[taly-diag] login transport failed");
    expect(line).toContain('"vercelRegion":"iad1"');
    expect(line).not.toMatch(/Authorization|Bearer|access_token|password/i);
  });
});
