/**
 * Safe Taly connectivity diagnostics for Production transport failures.
 * Never logs secrets, Authorization headers, tokens, or customer data.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";

import {
  getTalyBaseHost,
  getTalyBaseUrl,
  getTalyBaseUrlAlignment,
} from "@/services/payments/taly-config";

const PROBE_TIMEOUT_MS = 8_000;

export type TalyErrorParts = {
  name: string | null;
  code: string | null;
  causeCode: string | null;
  reason: string;
};

export type TalyConnectivityProbe = {
  baseHost: string;
  baseKind: string;
  dnsOk: boolean;
  dnsMs: number | null;
  dnsCode: string | null;
  tlsOk: boolean;
  tlsMs: number | null;
  tlsCode: string | null;
  tlsProtocol: string | null;
  httpsOk: boolean;
  httpsMs: number | null;
  httpsStatus: number | null;
  httpsCode: string | null;
};

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.slice(0, max);
}

export function vercelExecutionRegion(): string | null {
  // VERCEL_REGION is the region where the Serverless/Fluid function executes.
  // Runtime log "region" under Fluid may reflect edge ingress instead.
  return truncate(process.env.VERCEL_REGION?.trim(), 32);
}

export function extractTalyErrorParts(error: unknown): TalyErrorParts {
  const err = error as { name?: string; code?: string; message?: string; cause?: unknown };
  const cause =
    err?.cause && typeof err.cause === "object"
      ? (err.cause as { code?: string; message?: string; name?: string })
      : null;
  return {
    name: truncate(typeof err?.name === "string" ? err.name : null, 80),
    code: truncate(typeof err?.code === "string" ? err.code : null, 80),
    causeCode: truncate(typeof cause?.code === "string" ? cause.code : null, 80),
    reason:
      truncate(typeof err?.message === "string" ? err.message : "fetch failed", 160) ??
      "fetch failed",
  };
}

function classifyNetworkSymptom(parts: TalyErrorParts): string {
  const blob = `${parts.code ?? ""} ${parts.causeCode ?? ""} ${parts.reason}`.toLowerCase();
  if (blob.includes("enotfound") || blob.includes("getaddrinfo")) return "dns";
  if (
    blob.includes("cert") ||
    blob.includes("tls") ||
    blob.includes("ssl") ||
    blob.includes("unable to verify")
  ) {
    return "tls";
  }
  if (blob.includes("etimedout") || blob.includes("timeout") || blob.includes("aborted"))
    return "timeout";
  if (blob.includes("econnreset") || blob.includes("socket hang up")) return "connection_reset";
  if (blob.includes("econnrefused")) return "connection_refused";
  if (blob.includes("eproto") || blob.includes("network")) return "network";
  return "unknown_transport";
}

async function probeDns(
  host: string,
): Promise<{ ok: boolean; ms: number | null; code: string | null }> {
  const started = Date.now();
  try {
    await dnsLookup(host);
    return { ok: true, ms: Date.now() - started, code: null };
  } catch (error) {
    const parts = extractTalyErrorParts(error);
    return { ok: false, ms: Date.now() - started, code: parts.code ?? parts.causeCode };
  }
}

async function probeTls(host: string): Promise<{
  ok: boolean;
  ms: number | null;
  code: string | null;
  protocol: string | null;
}> {
  const started = Date.now();
  return await new Promise((resolve) => {
    const socket = tlsConnect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: true,
      },
      () => {
        const protocol = typeof socket.getProtocol === "function" ? socket.getProtocol() : null;
        socket.end();
        resolve({
          ok: true,
          ms: Date.now() - started,
          code: null,
          protocol: truncate(protocol, 24),
        });
      },
    );
    socket.setTimeout(PROBE_TIMEOUT_MS, () => {
      socket.destroy();
      resolve({ ok: false, ms: Date.now() - started, code: "ETIMEDOUT", protocol: null });
    });
    socket.on("error", (error) => {
      const parts = extractTalyErrorParts(error);
      resolve({
        ok: false,
        ms: Date.now() - started,
        code: parts.code ?? parts.causeCode,
        protocol: null,
      });
    });
  });
}

async function probeHttps(baseUrl: string): Promise<{
  ok: boolean;
  ms: number | null;
  status: number | null;
  code: string | null;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Unauthenticated probe only — expect 4xx from OAuth token endpoint, which still proves reachability.
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/uaa/oauth/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=password",
      signal: controller.signal,
    });
    return {
      ok: true,
      ms: Date.now() - started,
      status: response.status,
      code: null,
    };
  } catch (error) {
    const parts = extractTalyErrorParts(error);
    return {
      ok: false,
      ms: Date.now() - started,
      status: null,
      code: parts.code ?? parts.causeCode ?? parts.name,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeTalyConnectivity(): Promise<TalyConnectivityProbe> {
  const alignment = getTalyBaseUrlAlignment();
  const host = alignment.host || getTalyBaseHost();
  const baseUrl = getTalyBaseUrl();
  const dns = await probeDns(host);
  const tls = dns.ok
    ? await probeTls(host)
    : { ok: false, ms: null, code: "skipped", protocol: null };
  const https =
    dns.ok && tls.ok
      ? await probeHttps(baseUrl)
      : { ok: false, ms: null, status: null, code: "skipped" };

  return {
    baseHost: host.slice(0, 120),
    baseKind: alignment.kind,
    dnsOk: dns.ok,
    dnsMs: dns.ms,
    dnsCode: dns.code,
    tlsOk: tls.ok,
    tlsMs: tls.ms,
    tlsCode: tls.code,
    tlsProtocol: tls.protocol,
    httpsOk: https.ok,
    httpsMs: https.ms,
    httpsStatus: https.status,
    httpsCode: https.code,
  };
}

export function buildLoginTransportDiagnostic(input: {
  error: unknown;
  attempt: string;
  durationMs: number;
  failedAt: string;
  oauthClientFromEnv: boolean;
  probe?: TalyConnectivityProbe | null;
}): Record<string, unknown> {
  const parts = extractTalyErrorParts(input.error);
  const alignment = getTalyBaseUrlAlignment();
  return {
    failedAt: input.failedAt,
    durationMs: input.durationMs,
    vercelRegion: vercelExecutionRegion(),
    regionNote:
      "VERCEL_REGION is function execution region; Fluid runtime-log region may show edge ingress",
    baseHost: alignment.host,
    baseKind: alignment.kind,
    productionRuntime: alignment.productionRuntime,
    mismatched: alignment.mismatched,
    attempt: input.attempt,
    oauthClientFromEnv: input.oauthClientFromEnv,
    errorName: parts.name,
    errorCode: parts.code,
    causeCode: parts.causeCode,
    symptom: classifyNetworkSymptom(parts),
    reason: parts.reason,
    probe: input.probe
      ? {
          dnsOk: input.probe.dnsOk,
          dnsMs: input.probe.dnsMs,
          dnsCode: input.probe.dnsCode,
          tlsOk: input.probe.tlsOk,
          tlsMs: input.probe.tlsMs,
          tlsCode: input.probe.tlsCode,
          tlsProtocol: input.probe.tlsProtocol,
          httpsOk: input.probe.httpsOk,
          httpsMs: input.probe.httpsMs,
          httpsStatus: input.probe.httpsStatus,
          httpsCode: input.probe.httpsCode,
        }
      : null,
  };
}

/** stderr-only diagnostic line for Vercel Runtime Logs (no secrets). */
export function writeTalyLoginTransportStderr(details: Record<string, unknown>): void {
  try {
    console.error(`[taly-diag] login transport failed ${JSON.stringify(details)}`);
  } catch {
    console.error("[taly-diag] login transport failed (details serialize error)");
  }
}
