import { afterEach, describe, expect, it } from "vitest";

import { fetchZoomHostZak } from "@/services/classes/zoom-service";

describe("Zoom host ZAK for in-app Meeting SDK", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("returns the host ZAK from the Zoom token API", async () => {
    process.env.ZOOM_ACCOUNT_ID = "acct_1";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s_client_1";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s_secret_1";
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "s2s-token", expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.includes("/users/me/token?type=zak")) {
        return new Response(JSON.stringify({ token: "host-zak-token" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    await expect(fetchZoomHostZak()).resolves.toBe("host-zak-token");
    expect(calls.some((url) => url.includes("/users/me/token?type=zak"))).toBe(true);
  });

  it("returns null when Zoom is not configured", async () => {
    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    await expect(fetchZoomHostZak()).resolves.toBeNull();
  });
});
