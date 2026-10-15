import { getServerEnv } from "@/config/env";

const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";

/**
 * General App Client ID / Client Secret for the Meeting SDK JWT.
 *
 * Official auth: https://developers.zoom.us/docs/meeting-sdk/auth/
 * `appKey` = Client ID. Sign HMAC-SHA256 with Client Secret.
 *
 * Server-to-Server OAuth (`grant_type=account_credentials` + ZOOM_ACCOUNT_ID)
 * is a different flow and is never used here.
 */
export function getZoomMeetingSdkCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const env = getServerEnv();
  const clientId =
    env.ZOOM_CLIENT_ID?.trim() ||
    env.ZOOM_SDK_KEY?.trim() ||
    env.ZOOM_MEETING_SDK_KEY?.trim() ||
    "";
  const clientSecret =
    env.ZOOM_CLIENT_SECRET?.trim() ||
    env.ZOOM_SDK_SECRET?.trim() ||
    env.ZOOM_MEETING_SDK_SECRET?.trim() ||
    "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export type MeetingSdkCredentialProbe = {
  configured: boolean;
  clientIdSuffix: string | null;
  clientIdLength: number;
  /** Zoom accepted the Client ID + Secret pair (token endpoint did not return invalid_client). */
  credentialPairValid: boolean | null;
  /** Short, non-secret reason when the pair check fails or is skipped. */
  detail: string | null;
};

/**
 * Validate Meeting SDK Client ID + Secret without exposing either value.
 *
 * Posts a deliberately invalid authorization_code grant. Zoom returns:
 * - `invalid_client` when the ID/secret pair is wrong or not an OAuth app
 * - `invalid_grant` (or similar) when the pair is accepted but the code is bad
 *
 * A valid pair is required for Meeting SDK JWTs. Error 3712 ("Signature is invalid")
 * almost always means the Vercel `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` are not the
 * matching Production credentials from the Meeting SDK General app (Embed enabled),
 * or the secret was copied from a different app (Instructor OAuth / S2S).
 */
export async function probeMeetingSdkCredentialPair(): Promise<MeetingSdkCredentialProbe> {
  const credentials = getZoomMeetingSdkCredentials();
  if (!credentials) {
    return {
      configured: false,
      clientIdSuffix: null,
      clientIdLength: 0,
      credentialPairValid: null,
      detail: "ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET are not set",
    };
  }

  const clientIdSuffix = credentials.clientId.slice(-4);
  const clientIdLength = credentials.clientId.length;
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString(
    "base64",
  );

  try {
    const res = await fetch(ZOOM_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "aviatorpass-sdk-pair-check",
        redirect_uri: "https://www.aviatorpass.com/api/integrations/zoom/callback",
      }),
      cache: "no-store",
    });
    const text = await res.text();
    let error: string | null = null;
    try {
      error = String((JSON.parse(text) as { error?: string }).error || "") || null;
    } catch {
      error = null;
    }

    if (error === "invalid_client" || res.status === 401) {
      return {
        configured: true,
        clientIdSuffix,
        clientIdLength,
        credentialPairValid: false,
        detail:
          "Zoom rejected ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET (invalid_client). Re-copy both from the same Meeting SDK General app App Credentials (Production). Do not use Instructor OAuth or S2S secrets.",
      };
    }

    // invalid_grant / unsupported_grant_type / 400 with other errors ⇒ pair accepted
    if (
      error === "invalid_grant" ||
      error === "unsupported_grant_type" ||
      error === "invalid_request" ||
      res.status === 400
    ) {
      return {
        configured: true,
        clientIdSuffix,
        clientIdLength,
        credentialPairValid: true,
        detail:
          "Client ID/Secret pair is accepted by Zoom. If join still returns 3712, enable Features → Embed → Meeting SDK on that app and use Production credentials.",
      };
    }

    return {
      configured: true,
      clientIdSuffix,
      clientIdLength,
      credentialPairValid: res.ok ? true : null,
      detail: error ? `Zoom token probe returned ${error}` : `Zoom token probe HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      clientIdSuffix,
      clientIdLength,
      credentialPairValid: null,
      detail: error instanceof Error ? error.message : "Zoom token probe failed",
    };
  }
}
