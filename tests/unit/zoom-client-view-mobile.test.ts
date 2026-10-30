import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  prefersMeetingSdkClientView,
  resolveClassroomSdkView,
} from "@/features/zoom/lib/classroom-view-mode";
import {
  ZOOM_CLIENT_VIEW_SDK_VERSION,
  ZOOM_CLIENT_VIEW_SDK_SCRIPTS,
} from "@/features/zoom/lib/load-client-view-sdk";
import { ZOOM_EMBEDDED_SDK_VERSION } from "@/features/zoom/lib/load-embedded-sdk";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Meeting SDK dual-path Client View (mobile)", () => {
  it("keeps Client View and Component View on the same SDK release line", () => {
    expect(ZOOM_CLIENT_VIEW_SDK_VERSION).toBe("6.2.0");
    expect(ZOOM_CLIENT_VIEW_SDK_VERSION).toBe(ZOOM_EMBEDDED_SDK_VERSION);
    expect(ZOOM_CLIENT_VIEW_SDK_SCRIPTS.some((s) => s.includes("zoom-meeting-6.2.0.min.js"))).toBe(
      true,
    );
    expect(ZOOM_CLIENT_VIEW_SDK_SCRIPTS.every((s) => !s.includes("embedded"))).toBe(true);
  });

  it("selects Client View for phones/tablets and Component View for wide desktop", () => {
    expect(
      resolveClassroomSdkView({ width: 390, userAgent: "Mozilla/5.0 (Linux; Android 14)" }),
    ).toBe("client");
    expect(
      resolveClassroomSdkView({
        width: 820,
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      }),
    ).toBe("client");
    expect(
      resolveClassroomSdkView({
        width: 1440,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      }),
    ).toBe("component");
    expect(prefersMeetingSdkClientView({ width: 1280, search: "sdkView=client" })).toBe(true);
    expect(prefersMeetingSdkClientView({ width: 360, search: "sdkView=component" })).toBe(false);
  });

  it("allows Zoom CDN media under CSP for Client View chimes/wasm audio", () => {
    const cfg = src("next.config.ts");
    expect(cfg).toMatch(/media-src[^"]*https:\/\/source\.zoom\.us/);
    expect(cfg).toMatch(/media-src[^"]*https:\/\/\*\.zoom\.us/);
  });

  it("wires join page to Client View on mobile without personal Zoom OAuth", () => {
    const join = src("features/classes/components/join-class-client.tsx");
    expect(join).toMatch(/InAppZoomClientView/);
    expect(join).toMatch(/resolveClassroomSdkView/);
    expect(join).toMatch(/sdkView === "client"/);
    expect(join).toMatch(/prefetchZoomClientViewSdk/);

    const client = src("features/zoom/components/in-app-zoom-client-view.tsx");
    expect(client).toMatch(/loadZoomClientView/);
    expect(client).toMatch(/joinZoomClientViewMeeting/);
    expect(client).toMatch(/No personal Zoom account is required/);
    expect(client).toMatch(/sessionJoinKey/);
    expect(client).toMatch(/boot skipped — meeting already live/);
    expect(client).toMatch(/leaveUrl/);
    expect(client).toMatch(/\?left=1/);
    // Must not overlay Leave on live Client View chrome
    expect(client).not.toMatch(/classroom-client-live-banner/);
  });
});
