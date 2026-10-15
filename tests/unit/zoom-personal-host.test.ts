import { describe, expect, it } from "vitest";

import {
  hasPersonalInstructorZoom,
  isSharedPlatformZoomAccount,
  isS2SDelegateIntegration,
} from "@/services/zoom/oauth-service";
import type { ZoomIntegrationRecord } from "@/types/zoom-oauth";

function row(partial: Partial<ZoomIntegrationRecord>): ZoomIntegrationRecord {
  const now = new Date().toISOString();
  return {
    id: "int-1",
    userId: "instructor-1",
    zoomUserId: "zu_abc",
    zoomEmail: "teacher@school.test",
    accessToken: "enc",
    refreshToken: "enc",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    scopes: "user:read:user",
    status: "connected",
    connectedAt: now,
    lastSyncAt: now,
    cachedProfile: null,
    profileCachedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe("personal instructor Zoom host", () => {
  it("flags platform accountEmail as shared and blocks personal hosting", () => {
    const shared = row({ zoomEmail: "ceo@aviatorpass.com" });
    expect(isSharedPlatformZoomAccount(shared, "ceo@aviatorpass.com")).toBe(true);
    expect(hasPersonalInstructorZoom(shared, "ceo@aviatorpass.com")).toBe(false);
  });

  it("allows a distinct personal Zoom email", () => {
    const personal = row({ zoomEmail: "sara@school.test" });
    expect(isSharedPlatformZoomAccount(personal, "ceo@aviatorpass.com")).toBe(false);
    expect(hasPersonalInstructorZoom(personal, "ceo@aviatorpass.com")).toBe(true);
  });

  it("treats placeholder oauth: user ids as not personal", () => {
    const placeholder = row({ zoomUserId: "oauth:pending" });
    expect(hasPersonalInstructorZoom(placeholder, "ceo@aviatorpass.com")).toBe(false);
  });

  it("exports S2S delegate helper for shared-platform detection", () => {
    expect(typeof isS2SDelegateIntegration).toBe("function");
    expect(isS2SDelegateIntegration(null)).toBe(false);
  });
});
