import { describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ACCOUNT_STATUS } from "@/constants/account-status";
import {
  postAuthRedirect,
  roleMayFollowReturnPath,
  sanitizeReturnPath,
} from "@/lib/security/safe-return-path";
import type { UserProfile } from "@/types";

function profile(role: UserProfile["role"], extra?: Partial<UserProfile>): UserProfile {
  return {
    id: "u1",
    email: "user@aviatorpass.com",
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    phone: null,
    countryCode: null,
    nationality: null,
    dateOfBirth: null,
    gender: null,
    city: null,
    bio: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    avatarUrl: null,
    timezone: "Asia/Kuwait",
    language: "en",
    role,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    profileComplete: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

describe("sanitizeReturnPath", () => {
  it("keeps the instructor Zoom profile path", () => {
    expect(sanitizeReturnPath("/instructor/profile")).toBe("/instructor/profile");
    expect(sanitizeReturnPath("/instructor/profile?zoom=connected")).toBe(
      "/instructor/profile?zoom=connected",
    );
  });

  it("rejects open redirects and traversal", () => {
    expect(sanitizeReturnPath("https://evil.example/phish")).toBeNull();
    expect(sanitizeReturnPath("//evil.example")).toBeNull();
    expect(sanitizeReturnPath("/\\evil.example")).toBeNull();
    expect(sanitizeReturnPath("/instructor/../student/dashboard")).toBeNull();
    expect(sanitizeReturnPath("/%2e%2e/student/dashboard")).toBeNull();
    expect(sanitizeReturnPath("/login")).toBeNull();
    expect(sanitizeReturnPath("/api/auth/login")).toBeNull();
  });
});

describe("postAuthRedirect return path", () => {
  it("sends an instructor back to the requested Zoom profile", () => {
    expect(postAuthRedirect(profile(ROLES.INSTRUCTOR), "/instructor/profile")).toBe(
      "/instructor/profile",
    );
  });

  it("keeps the role dashboard when login has no return path", () => {
    expect(postAuthRedirect(profile(ROLES.INSTRUCTOR))).toBe("/instructor/dashboard");
    expect(postAuthRedirect(profile(ROLES.STUDENT), null)).toBe("/student/dashboard");
  });

  it("returns both reviewer roles to the Meeting SDK classroom", () => {
    expect(roleMayFollowReturnPath(ROLES.INSTRUCTOR, "/join")).toBe(true);
    expect(roleMayFollowReturnPath(ROLES.STUDENT, "/join")).toBe(true);
    expect(postAuthRedirect(profile(ROLES.INSTRUCTOR), "/join")).toBe("/join");
    expect(postAuthRedirect(profile(ROLES.STUDENT), "/join")).toBe("/join");
    expect(postAuthRedirect(profile(ROLES.STUDENT), "/join/class-1")).toBe("/join/class-1");
  });

  it("does not let a student follow an instructor return path", () => {
    expect(roleMayFollowReturnPath(ROLES.STUDENT, "/instructor/profile")).toBe(false);
    expect(postAuthRedirect(profile(ROLES.STUDENT), "/instructor/profile")).toBe(
      "/student/dashboard",
    );
  });

  it("lets CGI open instructor pages and blocks students from CGI", () => {
    expect(roleMayFollowReturnPath(ROLES.CHIEF_GROUND_INSTRUCTOR, "/instructor/profile")).toBe(
      true,
    );
    expect(postAuthRedirect(profile(ROLES.STUDENT), "/cgi/dashboard")).toBe("/student/dashboard");
  });

  it("still forces password change and incomplete profiles ahead of the return path", () => {
    expect(
      postAuthRedirect(
        profile(ROLES.INSTRUCTOR, { mustChangePassword: true }),
        "/instructor/profile",
      ),
    ).toBe("/change-password");
    expect(
      postAuthRedirect(profile(ROLES.STUDENT, { profileComplete: false }), "/student/courses"),
    ).toBe("/complete-profile");
  });
});
