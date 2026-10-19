import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPECTED_PRODUCTION_INSTRUCTOR_CLIENT_ID,
  getInstructorOAuthAlignment,
  probeOAuthClientPair,
} from "@/lib/zoom/oauth-alignment";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function zoomResponse(error: string, status = 400) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("instructor OAuth alignment", () => {
  it("treats invalid_grant as a matching client pair and invalid_client as a mismatch", async () => {
    expect((await probeOAuthClientPair("", "secret")).pairAccepted).toBeNull();

    globalThis.fetch = vi.fn(async (_input, init) => {
      const header = new Headers(init?.headers).get("Authorization") || "";
      const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
      if (decoded.startsWith("good-id:")) return zoomResponse("invalid_grant");
      return zoomResponse("invalid_client", 401);
    }) as typeof fetch;

    expect(await probeOAuthClientPair("good-id", "good-secret")).toMatchObject({
      pairAccepted: true,
      error: "invalid_grant",
    });
    expect(await probeOAuthClientPair("bad-id", "good-secret")).toMatchObject({
      pairAccepted: false,
      error: "invalid_client",
    });
  });

  it("reports which stored secret belongs to the expected production client", async () => {
    process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
    process.env.ZOOM_INSTRUCTOR_CLIENT_ID = "development-client-dhiQ";
    process.env.ZOOM_INSTRUCTOR_CLIENT_SECRET = "instructor-secret";
    process.env.ZOOM_CLIENT_ID = "meeting-sdk-client-VGTQ";
    process.env.ZOOM_CLIENT_SECRET = "sdk-secret";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s-client-abcd";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s-secret";
    process.env.ZOOM_REDIRECT_URI = "https://www.aviatorpass.com/api/integrations/zoom/callback";

    globalThis.fetch = vi.fn(async (_input, init) => {
      const header = new Headers(init?.headers).get("Authorization") || "";
      const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
      const [id, secret] = decoded.split(":");
      const expectedMatchesInstructor =
        id === EXPECTED_PRODUCTION_INSTRUCTOR_CLIENT_ID && secret === "instructor-secret";
      const configuredMatches = id === "development-client-dhiQ" && secret === "instructor-secret";
      if (expectedMatchesInstructor || configuredMatches) return zoomResponse("invalid_grant");
      return zoomResponse("invalid_client", 401);
    }) as typeof fetch;

    const alignment = await getInstructorOAuthAlignment();
    expect(alignment.configuredMatchesExpectedProductionClientId).toBe(false);
    expect(alignment.configuredInstructorClientIdSuffix).toBe("dhiQ");
    expect(alignment.expectedProductionClientIdSuffix).toBe("Z0xA");
    expect(alignment.instructorIdEqualsMeetingSdkId).toBe(false);
    expect(alignment.instructorSecretEqualsMeetingSdkSecret).toBe(false);
    expect(alignment.configuredInstructorPair.pairAccepted).toBe(true);
    expect(alignment.expectedClientWithInstructorSecret.pairAccepted).toBe(true);
    expect(alignment.expectedClientWithMeetingSdkSecret.pairAccepted).toBe(false);
    expect(alignment.expectedClientWithS2sSecret.pairAccepted).toBe(false);
    expect(JSON.stringify(alignment)).not.toContain("instructor-secret");
    expect(JSON.stringify(alignment)).not.toContain("sdk-secret");
  });
});
