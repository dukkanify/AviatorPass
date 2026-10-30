import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { roleMayFollowReturnPath, sanitizeReturnPath } from "@/lib/security/safe-return-path";
import { ROLES } from "@/constants/roles";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("join session gate", () => {
  it("keeps /join return paths safe for instructor and student", () => {
    const next = "/join/1bd88dfd5a8d69fc5c78d1d3d1e90af3";
    expect(sanitizeReturnPath(next)).toBe(next);
    expect(roleMayFollowReturnPath(ROLES.INSTRUCTOR, next)).toBe(true);
    expect(roleMayFollowReturnPath(ROLES.STUDENT, next)).toBe(true);
  });

  it("middleware sends signed-in users with ?next=/join… into the classroom", () => {
    const middleware = src("middleware.ts");
    expect(middleware).toMatch(/sanitizeReturnPath/);
    expect(middleware).toMatch(/roleMayFollowReturnPath/);
    expect(middleware).toMatch(/pathname === routes\.login/);
    expect(middleware).toMatch(/NextResponse\.redirect\(new URL\(safe, request\.url\)\)/);
  });

  it("login form preserves an active session when next is a safe classroom path", () => {
    const login = src("features/auth/components/login-form.tsx");
    expect(login).toMatch(/sanitizeReturnPath\(returnTo\)/);
    expect(login).toMatch(/roleMayFollowReturnPath\(user\.role, safe\)/);
    expect(login).toMatch(/router\.replace\(safe\)/);
  });

  it("join client waits for auth, maps 401→login?next and 403→access denied", () => {
    const join = src("features/classes/components/join-class-client.tsx");
    expect(join).toMatch(/authLoading/);
    expect(join).toContain("?next=");
    expect(join).toContain("encodeURIComponent(`/join/${classId}`)");
    expect(join).toMatch(/Access denied/);
    expect(join).toMatch(/Back to dashboard/);
    expect(join).toMatch(/result\.status === 401/);
    expect(join).toMatch(/result\.status === 403/);
    expect(join).not.toMatch(/<Link href="\/login">Sign in<\/Link>/);
  });

  it("never unmounts Zoom behind a skeleton after the first join payload", () => {
    const join = src("features/classes/components/join-class-client.tsx");
    expect(join).toMatch(/hasJoinPayloadRef/);
    expect(join).toMatch(/liveSdkRef/);
    expect(join).toMatch(/\(authLoading \|\| loading\) && !data/);
    expect(join).toMatch(/keeping room/);
  });

  it("joins Meeting SDK once per meeting identity, ignoring signature remints", () => {
    const room = src("features/zoom/components/in-app-zoom-room.tsx");
    expect(room).toMatch(/sessionJoinKey/);
    expect(room).toMatch(/joinedKeyRef/);
    expect(room).toMatch(/liveMeetingRef/);
    expect(room).toMatch(/joinedKeyRef\.current === sessionJoinKey/);
    // Signature/ZAK must NOT be part of the join effect identity.
    expect(room).toContain("[session.mode, session.meetingNumber, String(attempt)].join");
    expect(room).not.toContain("session.signature ??");
    expect(room).not.toContain("session.zak ??");
    expect(room).toMatch(/boot skipped — meeting already live/);
    expect(room).toMatch(/mutationObserver\.observe\(stage,/);
    expect(room).not.toMatch(
      /}, \[attempt, isHost, liveClassId, session, startLocalMedia, stopLocalMedia\]\);/,
    );
  });

  it("separates schedule Finished from live meeting connection status", () => {
    const join = src("features/classes/components/join-class-client.tsx");
    expect(join).toMatch(/scheduleStatus/);
    expect(join).toMatch(/panelMeetingLabel/);
    expect(join).toMatch(/panelScheduleLabel/);
    expect(join).toMatch(/Window ended \(meeting still open\)/);
    expect(join).toMatch(/Schedule status/);
    expect(join).toMatch(/Not connected/);
  });

  it("production session cookies share Domain=.aviatorpass.com", () => {
    const cookies = src("lib/security/cookies.ts");
    expect(cookies).toMatch(/\.aviatorpass\.com/);
    expect(cookies).toMatch(/sessionCookieDomain/);
  });

  it("marks roster denial as HTTP 403", () => {
    expect(src("services/classes/zoom-service.ts")).toMatch(
      /You are not invited to this class", 403/,
    );
    expect(src("services/classes/class-service.ts")).toMatch(
      /You are not invited to this class", 403/,
    );
  });
});
