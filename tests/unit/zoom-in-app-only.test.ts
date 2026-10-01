import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ZOOM_EMBEDDED_SDK_SCRIPTS } from "@/features/zoom/lib/load-embedded-sdk";
import { getZoomMeetingSdkCredentials } from "@/lib/zoom/sdk-credentials";
import { getZoomS2SCredentials } from "@/lib/zoom/s2s-credentials";
import { linkExistingZoomMeeting } from "@/services/classes/zoom-service";
import { writeClassesDb } from "@/services/classes/store";
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

  it("signs a Meeting SDK JWT from General App Client ID and Secret", () => {
    const token = generateMeetingSdkSignature({
      clientId: "general-app-client",
      clientSecret: "general-app-secret",
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
      appKey: string;
      sdkKey?: string;
      video_webrtc_mode?: number;
    };
    expect(decoded.mn).toBe("123456789");
    expect(decoded.role).toBe(0);
    expect(decoded.appKey).toBe("general-app-client");
    expect(decoded.sdkKey).toBeUndefined();
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
    expect(room).not.toMatch(/sdkKey:/);
    expect(room).toMatch(/tk:\s*""/);
    expect(room).toMatch(/Host ZAK rejected; joining with General App JWT only/);
    expect(room).toMatch(/stageRef\.current\.replaceChildren\(\)/);
  });

  it("loads Zoom vendor React before the embedded Meeting SDK", () => {
    expect(ZOOM_EMBEDDED_SDK_SCRIPTS[0]).toMatch(/\/lib\/vendor\/react\.min\.js$/);
    expect(ZOOM_EMBEDDED_SDK_SCRIPTS.at(-1)).toMatch(/zoom-meeting-embedded-6\.2\.0\.min\.js$/);
    const joinRoute = readFileSync(
      resolve(process.cwd(), "app/api/classes/[id]/join/route.ts"),
      "utf8",
    );
    expect(joinRoute).toMatch(/markJoin failed; student can still enter the classroom/);
  });

  it("signs the official Meeting SDK JWT from General App Client ID and Secret", () => {
    const previous = {
      ZOOM_SDK_KEY: process.env.ZOOM_SDK_KEY,
      ZOOM_SDK_SECRET: process.env.ZOOM_SDK_SECRET,
      ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
      ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
      ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID,
      ZOOM_S2S_CLIENT_ID: process.env.ZOOM_S2S_CLIENT_ID,
      ZOOM_S2S_CLIENT_SECRET: process.env.ZOOM_S2S_CLIENT_SECRET,
    };
    process.env.ZOOM_SDK_KEY = "legacy-sdk-key";
    process.env.ZOOM_SDK_SECRET = "legacy-sdk-secret";
    process.env.ZOOM_CLIENT_ID = "general-app-client";
    process.env.ZOOM_CLIENT_SECRET = "general-app-secret";
    process.env.ZOOM_ACCOUNT_ID = "s2s-account";
    process.env.ZOOM_S2S_CLIENT_ID = "s2s-client";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s-secret";
    expect(getZoomMeetingSdkCredentials()).toEqual({
      clientId: "general-app-client",
      clientSecret: "general-app-secret",
    });
    const token = generateMeetingSdkSignature({
      clientId: "general-app-client",
      clientSecret: "general-app-secret",
      meetingNumber: "86524929538",
      role: 0,
      nowSec: 1_700_000_030,
    });
    const decoded = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as {
      appKey: string;
    };
    expect(decoded.appKey).toBe("general-app-client");
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    expect(getZoomMeetingSdkCredentials()).toBeNull();
    if (previous.ZOOM_SDK_KEY === undefined) delete process.env.ZOOM_SDK_KEY;
    else process.env.ZOOM_SDK_KEY = previous.ZOOM_SDK_KEY;
    if (previous.ZOOM_SDK_SECRET === undefined) delete process.env.ZOOM_SDK_SECRET;
    else process.env.ZOOM_SDK_SECRET = previous.ZOOM_SDK_SECRET;
    if (previous.ZOOM_CLIENT_ID === undefined) delete process.env.ZOOM_CLIENT_ID;
    else process.env.ZOOM_CLIENT_ID = previous.ZOOM_CLIENT_ID;
    if (previous.ZOOM_CLIENT_SECRET === undefined) delete process.env.ZOOM_CLIENT_SECRET;
    else process.env.ZOOM_CLIENT_SECRET = previous.ZOOM_CLIENT_SECRET;
    if (previous.ZOOM_ACCOUNT_ID === undefined) delete process.env.ZOOM_ACCOUNT_ID;
    else process.env.ZOOM_ACCOUNT_ID = previous.ZOOM_ACCOUNT_ID;
    if (previous.ZOOM_S2S_CLIENT_ID === undefined) delete process.env.ZOOM_S2S_CLIENT_ID;
    else process.env.ZOOM_S2S_CLIENT_ID = previous.ZOOM_S2S_CLIENT_ID;
    if (previous.ZOOM_S2S_CLIENT_SECRET === undefined) delete process.env.ZOOM_S2S_CLIENT_SECRET;
    else process.env.ZOOM_S2S_CLIENT_SECRET = previous.ZOOM_S2S_CLIENT_SECRET;
  });

  it("keeps Server-to-Server OAuth off the Meeting SDK JWT path", () => {
    const previous = {
      ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
      ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
      ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID,
      ZOOM_S2S_CLIENT_ID: process.env.ZOOM_S2S_CLIENT_ID,
      ZOOM_S2S_CLIENT_SECRET: process.env.ZOOM_S2S_CLIENT_SECRET,
    };
    process.env.ZOOM_CLIENT_ID = "general-app-client";
    process.env.ZOOM_CLIENT_SECRET = "general-app-secret";
    process.env.ZOOM_ACCOUNT_ID = "s2s-account";
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
    expect(getZoomS2SCredentials()).toBeNull();
    process.env.ZOOM_S2S_CLIENT_ID = "s2s-client";
    process.env.ZOOM_S2S_CLIENT_SECRET = "s2s-secret";
    expect(getZoomS2SCredentials()).toEqual({
      accountId: "s2s-account",
      clientId: "s2s-client",
      clientSecret: "s2s-secret",
    });
    if (previous.ZOOM_CLIENT_ID === undefined) delete process.env.ZOOM_CLIENT_ID;
    else process.env.ZOOM_CLIENT_ID = previous.ZOOM_CLIENT_ID;
    if (previous.ZOOM_CLIENT_SECRET === undefined) delete process.env.ZOOM_CLIENT_SECRET;
    else process.env.ZOOM_CLIENT_SECRET = previous.ZOOM_CLIENT_SECRET;
    if (previous.ZOOM_ACCOUNT_ID === undefined) delete process.env.ZOOM_ACCOUNT_ID;
    else process.env.ZOOM_ACCOUNT_ID = previous.ZOOM_ACCOUNT_ID;
    if (previous.ZOOM_S2S_CLIENT_ID === undefined) delete process.env.ZOOM_S2S_CLIENT_ID;
    else process.env.ZOOM_S2S_CLIENT_ID = previous.ZOOM_S2S_CLIENT_ID;
    if (previous.ZOOM_S2S_CLIENT_SECRET === undefined) delete process.env.ZOOM_S2S_CLIENT_SECRET;
    else process.env.ZOOM_S2S_CLIENT_SECRET = previous.ZOOM_S2S_CLIENT_SECRET;
  });

  it("attaches an existing Zoom meeting without calling S2S", () => {
    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const meeting = linkExistingZoomMeeting({
      liveClass: {
        id: "cls_attach_zoom",
        title: "Attached Zoom",
        description: "",
        courseId: null,
        moduleId: null,
        lessonId: null,
        instructorId: "instructor_1",
        assistantInstructorId: null,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
        durationMinutes: 30,
        timezone: "Asia/Kuwait",
        maxStudents: 10,
        meetingType: "meeting",
        status: "scheduled",
        zoomMeetingId: null,
        recurringRuleId: null,
        parentClassId: null,
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
        createdById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      zoomMeetingNumber: "86524929538",
      password: "pass1",
    });
    expect(meeting.providerMode).toBe("zoom");
    expect(meeting.zoomMeetingId).toBe("86524929538");
    expect(meeting.joinUrl).not.toMatch(/zoom\.us/);
    writeClassesDb((db) => {
      db.classes = db.classes.filter((item) => item.id !== "cls_attach_zoom");
      db.zoomMeetings = db.zoomMeetings.filter((item) => item.liveClassId !== "cls_attach_zoom");
    });
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
