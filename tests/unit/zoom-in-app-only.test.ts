import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ZOOM_EMBEDDED_SDK_SCRIPTS } from "@/features/zoom/lib/load-embedded-sdk";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import {
  displayMeetingName,
  extractZoomMeetingNumber,
  generateMeetingSdkSignature,
  isExternalZoomUrl,
  resolveInAppMeetingMode,
  zakFromStartUrl,
} from "@/lib/zoom/meeting-sdk";

const JOIN_SURFACES = [
  "features/zoom/components/in-app-zoom-room.tsx",
  "features/classes/components/join-class-client.tsx",
  "features/bookings/components/booking-join-lobby.tsx",
  "features/classes/components/class-detail-view.tsx",
  "features/mock-exams/components/mock-exam-examiner-view.tsx",
  "features/mock-exams/components/mock-exam-booking-view.tsx",
];

describe("Zoom stays inside AviatorPass", () => {
  it("detects Zoom hosts that must never be used as leave-site links", () => {
    expect(isExternalZoomUrl("https://zoom.us/j/123456789")).toBe(true);
    expect(isExternalZoomUrl("https://us02web.zoom.us/s/123456789?zak=token")).toBe(true);
    expect(isExternalZoomUrl("https://www.aviatorpass.com/join/class-1")).toBe(false);
    expect(isExternalZoomUrl("/join/class-1")).toBe(false);
  });

  it("extracts the meeting number from Zoom or in-app URLs", () => {
    expect(extractZoomMeetingNumber("https://zoom.us/j/86524929538?pwd=abc")).toBe("86524929538");
    expect(extractZoomMeetingNumber("/join/class-1?mid=123456789", "123456789")).toBe("123456789");
  });

  it("reads the host ZAK from a start URL without exposing it as a navigation target", () => {
    expect(zakFromStartUrl("https://us02web.zoom.us/s/111?zak=secret-token")).toBe("secret-token");
    expect(zakFromStartUrl("https://www.aviatorpass.com/join/class-1?host=1")).toBeNull();
  });

  it("uses the first-party classroom unless live Zoom SDK credentials exist", () => {
    expect(
      resolveInAppMeetingMode({
        providerMode: "zoom",
        meetingNumber: "86524929538",
        hasSdkCredentials: true,
      }),
    ).toBe("sdk");
    expect(
      resolveInAppMeetingMode({
        providerMode: "mock",
        meetingNumber: "86524929538",
        hasSdkCredentials: true,
      }),
    ).toBe("classroom");
    expect(
      resolveInAppMeetingMode({
        providerMode: "zoom",
        meetingNumber: "86524929538",
        hasSdkCredentials: false,
      }),
    ).toBe("classroom");
  });

  it("signs a Meeting SDK JWT for the in-app client", () => {
    const token = generateMeetingSdkSignature({
      sdkKey: "sdk-key",
      sdkSecret: "sdk-secret",
      meetingNumber: "123456789",
      role: 0,
      nowSec: 1_700_000_030,
    });
    const [header, payload, signature] = token.split(".");
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as {
      mn: string;
      role: number;
      sdkKey: string;
      video_webrtc_mode?: number;
    };
    expect(decoded.mn).toBe("123456789");
    expect(decoded.role).toBe(0);
    expect(decoded.sdkKey).toBe("sdk-key");
    expect(decoded.video_webrtc_mode).toBe(1);
  });

  it("uses the signed-in AviatorPass name inside the classroom", () => {
    expect(displayMeetingName({ fullName: "Layla Pilot" })).toBe("Layla Pilot");
    expect(displayMeetingName({ firstName: "Omar", lastName: "Instructor" })).toBe(
      "Omar Instructor",
    );
    expect(displayMeetingName({ email: "student@aviatorpass.com" })).toBe("student");
  });

  it("does not open Zoom in a new tab from join surfaces", () => {
    for (const rel of JOIN_SURFACES) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/Open in Zoom/);
      expect(src).not.toMatch(/Continue to meeting/);
      expect(src).not.toMatch(/window\.open\([^)]*zoom/i);
      expect(src).not.toMatch(/href=\{[^}]*startUrl/);
      expect(src).not.toMatch(/href=\{[^}]*joinUrl/);
    }
    const room = readFileSync(
      resolve(process.cwd(), "features/zoom/components/in-app-zoom-room.tsx"),
      "utf8",
    );
    expect(room).toMatch(/sdkKey:\s*active\.sdkKey/);
    expect(room).toMatch(/tk:\s*""/);
    expect(room).toMatch(/stageRef\.current\.replaceChildren\(\)/);
  });

  it("loads Zoom vendor React before the embedded Meeting SDK", () => {
    expect(ZOOM_EMBEDDED_SDK_SCRIPTS[0]).toMatch(/\/lib\/vendor\/react\.min\.js$/);
    expect(ZOOM_EMBEDDED_SDK_SCRIPTS.at(-1)).toMatch(/zoom-meeting-embedded-3\.13\.2\.min\.js$/);
    const joinRoute = readFileSync(
      resolve(process.cwd(), "app/api/classes/[id]/join/route.ts"),
      "utf8",
    );
    expect(joinRoute).toMatch(/markJoin failed; student can still enter the classroom/);
  });

  it("does not sign Meeting SDK JWTs with Server-to-Server OAuth keys", () => {
    const previous = {
      ZOOM_SDK_KEY: process.env.ZOOM_SDK_KEY,
      ZOOM_SDK_SECRET: process.env.ZOOM_SDK_SECRET,
      ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
      ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
    };
    process.env.ZOOM_CLIENT_ID = "s2s-client";
    process.env.ZOOM_CLIENT_SECRET = "s2s-secret";
    delete process.env.ZOOM_SDK_KEY;
    delete process.env.ZOOM_SDK_SECRET;
    expect(getZoomMeetingSdkCredentials()).toBeNull();
    process.env.ZOOM_SDK_KEY = "sdk-key";
    process.env.ZOOM_SDK_SECRET = "sdk-secret";
    expect(getZoomMeetingSdkCredentials()).toEqual({ sdkKey: "sdk-key", sdkSecret: "sdk-secret" });
    if (previous.ZOOM_SDK_KEY === undefined) delete process.env.ZOOM_SDK_KEY;
    else process.env.ZOOM_SDK_KEY = previous.ZOOM_SDK_KEY;
    if (previous.ZOOM_SDK_SECRET === undefined) delete process.env.ZOOM_SDK_SECRET;
    else process.env.ZOOM_SDK_SECRET = previous.ZOOM_SDK_SECRET;
    if (previous.ZOOM_CLIENT_ID === undefined) delete process.env.ZOOM_CLIENT_ID;
    else process.env.ZOOM_CLIENT_ID = previous.ZOOM_CLIENT_ID;
    if (previous.ZOOM_CLIENT_SECRET === undefined) delete process.env.ZOOM_CLIENT_SECRET;
    else process.env.ZOOM_CLIENT_SECRET = previous.ZOOM_CLIENT_SECRET;
  });

  it("allows camera and microphone so the classroom can stay on-site", () => {
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    const vercel = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
    expect(nextConfig).toMatch(/camera=\(self/);
    expect(nextConfig).toMatch(/microphone=\(self/);
    expect(nextConfig).not.toMatch(/camera=\(\)/);
    expect(vercel).toMatch(/camera=\(self/);
    expect(vercel).not.toMatch(/camera=\(\)/);
  });
});
