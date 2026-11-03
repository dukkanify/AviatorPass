import { beforeEach, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import { getPlatformSettings, updatePlatformSettings } from "@/services/settings/settings-service";
import {
  getInstructorZoomStatus,
  hasPersonalInstructorZoom,
  isSharedPlatformZoomAccount,
  isS2SDelegateIntegration,
} from "@/services/zoom/oauth-service";
import { encryptSecret } from "@/services/zoom/crypto";
import { resetZoomStoreForTests, upsertIntegration } from "@/services/zoom/store";
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

describe("getInstructorZoomStatus shared-platform enrichment", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
    process.env.ZOOM_CLIENT_ID = "zoom-sdk-client-id";
    process.env.ZOOM_CLIENT_SECRET = "zoom-sdk-client-secret";
    process.env.ZOOM_INSTRUCTOR_CLIENT_ID = "zoom-instructor-client-id";
    process.env.ZOOM_INSTRUCTOR_CLIENT_SECRET = "zoom-instructor-client-secret";
    process.env.ZOOM_REDIRECT_URI = "https://www.aviatorpass.com/api/integrations/zoom/callback";
    resetZoomStoreForTests();
    ensureDemoUsersSeeded();
  });

  it("flags shared platform host and blocks personalZoomReady", async () => {
    const instructor = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    const platformEmail = "ceo@aviatorpass.com";
    await updatePlatformSettings({
      patch: { zoom: { accountEmail: platformEmail } },
      actorId: "test-actor",
    });
    expect(getPlatformSettings().zoom.accountEmail).toBe(platformEmail);
    const now = new Date().toISOString();
    upsertIntegration({
      id: "int-shared",
      userId: instructor.id,
      zoomUserId: "zu_ceo",
      zoomEmail: platformEmail,
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scopes: "user:read:user",
      status: "connected",
      connectedAt: now,
      lastSyncAt: now,
      cachedProfile: null,
      profileCachedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const status = getInstructorZoomStatus(instructor.id);
    expect(status.connected).toBe(true);
    expect(status.sharedPlatformAccount).toBe(true);
    expect(status.personalZoomReady).toBe(false);
    expect(status.meetingReady).toBe(false);
    expect(status.needsReconnect).toBe(true);
    expect(status.status).toBe("reconnect_required");
  });

  it("marks a distinct personal Zoom email as personalZoomReady", async () => {
    const instructor = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    await updatePlatformSettings({
      patch: { zoom: { accountEmail: "ceo@aviatorpass.com" } },
      actorId: "test-actor",
    });
    const now = new Date().toISOString();
    upsertIntegration({
      id: "int-personal",
      userId: instructor.id,
      zoomUserId: "zu_sara",
      zoomEmail: "sara@school.test",
      accessToken: encryptSecret("access"),
      refreshToken: encryptSecret("refresh"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scopes: "user:read:user",
      status: "connected",
      connectedAt: now,
      lastSyncAt: now,
      cachedProfile: null,
      profileCachedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const status = getInstructorZoomStatus(instructor.id);
    expect(status.sharedPlatformAccount).toBe(false);
    expect(status.personalZoomReady).toBe(true);
    expect(status.meetingReady).toBe(true);
    expect(status.status).toBe("connected");
  });
});
