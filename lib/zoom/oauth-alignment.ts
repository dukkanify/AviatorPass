/**
 * Sanitized Instructor OAuth alignment check.
 * Compares the configured client with the Marketplace Production Client ID
 * and asks Zoom whether each secret belongs to that client.
 * Never returns or logs client secrets.
 */

import { getServerEnv } from "@/config/env";
import { PRODUCTION_ZOOM_OAUTH_REDIRECT_URI } from "@/services/zoom/config";

/** Marketplace Production Client ID for instructor Connect Zoom. Not a secret. */
export const EXPECTED_PRODUCTION_INSTRUCTOR_CLIENT_ID = "7z2krfWYQWCi20C0FRZ0xA";

const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";

export type OAuthPairProbe = {
  pairAccepted: boolean | null;
  error: string | null;
};

/**
 * Invalid authorization-code grant.
 * `invalid_client` means this ID and secret are not a pair.
 * `invalid_grant` means Zoom accepted the pair and rejected the dummy code.
 */
export async function probeOAuthClientPair(
  clientId: string,
  clientSecret: string,
): Promise<OAuthPairProbe> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id || !secret) return { pairAccepted: null, error: "missing" };

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  try {
    const res = await fetch(ZOOM_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "aviatorpass-oauth-pair-check",
        redirect_uri: PRODUCTION_ZOOM_OAUTH_REDIRECT_URI,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    let error: string | null = null;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      error = parsed.error ? String(parsed.error) : null;
    } catch {
      error = null;
    }
    if (error === "invalid_client" || res.status === 401) {
      return { pairAccepted: false, error: "invalid_client" };
    }
    if (
      error === "invalid_grant" ||
      error === "invalid_request" ||
      error === "unsupported_grant_type" ||
      res.status === 400
    ) {
      return { pairAccepted: true, error };
    }
    return { pairAccepted: res.ok ? true : null, error: error ?? `http_${res.status}` };
  } catch {
    return { pairAccepted: null, error: "probe_failed" };
  }
}

export type InstructorOAuthAlignment = {
  redirectUri: string;
  expectedProductionClientIdSuffix: string;
  expectedProductionClientIdLength: number;
  configuredInstructorClientIdSuffix: string | null;
  configuredInstructorClientIdLength: number;
  configuredMatchesExpectedProductionClientId: boolean;
  meetingSdkClientIdSuffix: string | null;
  s2sClientIdSuffix: string | null;
  instructorIdEqualsMeetingSdkId: boolean;
  instructorIdEqualsS2sId: boolean;
  instructorSecretEqualsMeetingSdkSecret: boolean;
  instructorSecretEqualsS2sSecret: boolean;
  configuredInstructorPair: OAuthPairProbe;
  /** Which configured secret Zoom accepts with the expected Production Client ID. */
  expectedProductionClientSecretMatch: Record<string, boolean | null>;
};

function suffix(value: string): string | null {
  return value ? value.slice(-4) : null;
}

/** Which stored Zoom app the live instructor client belongs to, without revealing secrets. */
export async function getInstructorOAuthAlignment(): Promise<InstructorOAuthAlignment> {
  const env = getServerEnv();
  const instructorId = env.ZOOM_INSTRUCTOR_CLIENT_ID?.trim() || "";
  const instructorSecret = env.ZOOM_INSTRUCTOR_CLIENT_SECRET?.trim() || "";
  const sdkId =
    env.ZOOM_CLIENT_ID?.trim() ||
    env.ZOOM_SDK_KEY?.trim() ||
    env.ZOOM_MEETING_SDK_KEY?.trim() ||
    "";
  const sdkSecret =
    env.ZOOM_CLIENT_SECRET?.trim() ||
    env.ZOOM_SDK_SECRET?.trim() ||
    env.ZOOM_MEETING_SDK_SECRET?.trim() ||
    "";
  const s2sId = env.ZOOM_S2S_CLIENT_ID?.trim() || "";
  const s2sSecret = env.ZOOM_S2S_CLIENT_SECRET?.trim() || "";
  const expected = EXPECTED_PRODUCTION_INSTRUCTOR_CLIENT_ID;
  const secretCandidates: Array<[string, string]> = [
    ["ZOOM_INSTRUCTOR_CLIENT_SECRET", instructorSecret],
    ["ZOOM_CLIENT_SECRET", env.ZOOM_CLIENT_SECRET?.trim() || ""],
    ["ZOOM_SDK_SECRET", env.ZOOM_SDK_SECRET?.trim() || ""],
    ["ZOOM_MEETING_SDK_SECRET", env.ZOOM_MEETING_SDK_SECRET?.trim() || ""],
    ["ZOOM_S2S_CLIENT_SECRET", s2sSecret],
  ];
  const seenSecrets = new Set<string>();
  const uniqueCandidates = secretCandidates.filter(([, secret]) => {
    if (!secret || seenSecrets.has(secret)) return false;
    seenSecrets.add(secret);
    return true;
  });

  const [configuredInstructorPair, ...expectedProbes] = await Promise.all([
    probeOAuthClientPair(instructorId, instructorSecret),
    ...uniqueCandidates.map(([, secret]) => probeOAuthClientPair(expected, secret)),
  ]);
  const expectedProductionClientSecretMatch: Record<string, boolean | null> = {};
  for (const [name] of secretCandidates) expectedProductionClientSecretMatch[name] = null;
  uniqueCandidates.forEach(([name], index) => {
    expectedProductionClientSecretMatch[name] = expectedProbes[index]?.pairAccepted ?? null;
    for (const [otherName, otherSecret] of secretCandidates) {
      if (otherSecret && otherSecret === uniqueCandidates[index]?.[1]) {
        expectedProductionClientSecretMatch[otherName] =
          expectedProbes[index]?.pairAccepted ?? null;
      }
    }
  });

  return {
    redirectUri: PRODUCTION_ZOOM_OAUTH_REDIRECT_URI,
    expectedProductionClientIdSuffix: expected.slice(-4),
    expectedProductionClientIdLength: expected.length,
    configuredInstructorClientIdSuffix: suffix(instructorId),
    configuredInstructorClientIdLength: instructorId.length,
    configuredMatchesExpectedProductionClientId: instructorId === expected,
    meetingSdkClientIdSuffix: suffix(sdkId),
    s2sClientIdSuffix: suffix(s2sId),
    instructorIdEqualsMeetingSdkId: Boolean(instructorId && instructorId === sdkId),
    instructorIdEqualsS2sId: Boolean(instructorId && instructorId === s2sId),
    instructorSecretEqualsMeetingSdkSecret: Boolean(
      instructorSecret && instructorSecret === sdkSecret,
    ),
    instructorSecretEqualsS2sSecret: Boolean(instructorSecret && instructorSecret === s2sSecret),
    configuredInstructorPair,
    expectedProductionClientSecretMatch,
  };
}
