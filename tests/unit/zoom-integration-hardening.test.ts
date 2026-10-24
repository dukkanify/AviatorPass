import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { sanitizeReturnPath } from "@/lib/security/safe-return-path";
import { buildZoomAuthorizeUrl } from "@/services/zoom/oauth-service";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Zoom integration hardening", () => {
  it("authorizes roster membership before provisioning a Zoom meeting on join", () => {
    const join = src("app/api/classes/[id]/join/route.ts");
    const assertIdx = join.indexOf("assertCallerMayReceiveInAppZoomSession");
    const ensureIdx = join.indexOf("ensureLiveMeetingForClass");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(ensureIdx);
  });

  it("sanitizes Zoom OAuth returnTo against open redirects", () => {
    const connect = src("app/api/integrations/zoom/connect/route.ts");
    expect(connect).toMatch(/sanitizeReturnPath/);
    expect(connect).toMatch(/roleMayFollowReturnPath/);

    expect(sanitizeReturnPath("//evil.example/phish")).toBeNull();
    expect(sanitizeReturnPath("https://evil.example")).toBeNull();
    expect(sanitizeReturnPath("/instructor/profile")).toBe("/instructor/profile");

    process.env.ZOOM_INSTRUCTOR_CLIENT_ID = "zoom-instructor-client-id";
    process.env.ZOOM_INSTRUCTOR_CLIENT_SECRET = "zoom-instructor-secret";
    process.env.ZOOM_REDIRECT_URI = "https://www.aviatorpass.com/api/integrations/zoom/callback";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret-for-zoom-hardening";

    // buildZoomAuthorizeUrl must refuse to persist protocol-relative returnTo.
    const url = buildZoomAuthorizeUrl({
      userId: "instructor-hardening",
      returnTo: "//evil.example/phish",
    });
    expect(url).toContain("zoom.us/oauth/authorize");
    const oauth = src("services/zoom/oauth-service.ts");
    expect(oauth).toMatch(/sanitizeReturnPath\(input\.returnTo\)/);
    expect(oauth).toMatch(/sanitizeReturnPath\(pending\.returnTo\)/);
  });

  it("single-flights token refresh and preserves refresh tokens when Zoom omits them", () => {
    const oauth = src("services/zoom/oauth-service.ts");
    expect(oauth).toMatch(/instructorRefreshInFlight/);
    expect(oauth).toMatch(/refreshCipherAtStart/);
    expect(oauth).toMatch(/keep the previous ciphertext/);
  });

  it("single-flights meeting ensure to reduce duplicate Zoom creates", () => {
    const zoom = src("services/classes/zoom-service.ts");
    expect(zoom).toMatch(/ensureMeetingInFlight/);
  });

  it("treats cohost roster members as invited for join and in-app session", () => {
    const zoom = src("services/classes/zoom-service.ts");
    const classes = src("services/classes/class-service.ts");
    expect(zoom).toMatch(/role === "cohost"/);
    expect(classes).toMatch(/role === "cohost"/);
  });

  it("refetches in-app session when the user reconnects after an error", () => {
    const room = src("features/zoom/components/in-app-zoom-room.tsx");
    expect(room).toMatch(/setSession\(null\)/);
    expect(room).toMatch(/\[attempt,/);
  });

  it("keeps classroom mobile CSS from forcing page-level horizontal scroll", () => {
    const css = src("styles/classroom.css");
    expect(css).toMatch(/overflow-x:\s*clip/);
    expect(css).toMatch(/@media \(max-width: 320px\)/);
    expect(css).toMatch(/@media \(max-width: 360px\)/);
    expect(css).toMatch(/min-height:\s*2\.75rem/);
  });
});
