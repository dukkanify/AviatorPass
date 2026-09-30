import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
    };
    expect(decoded.mn).toBe("123456789");
    expect(decoded.role).toBe(0);
    expect(decoded.sdkKey).toBe("sdk-key");
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
  });

  it("allows camera and microphone so the classroom can stay on-site", () => {
    const src = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(src).toMatch(/camera=\(self/);
    expect(src).toMatch(/microphone=\(self/);
    expect(src).not.toMatch(/camera=\(\)/);
  });
});
