/**
 * Permanent demo accounts + platform demo environment.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_ACCOUNTS,
  PRIMARY_DEMO_EMAILS,
  canonicalDemoEmail,
  isPermanentDemoEmail,
  remapLegacyDemoEmail,
} from "@/constants/demo-accounts";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb, writeAuthDb } from "@/services/auth/store";
import { ensurePlatformDemoEnvironment } from "@/services/demo/platform-demo-seed";
import { resetDemoEnvironment } from "@/services/demo/reset-demo-environment";
import { readCoursesDb } from "@/services/courses/store";
import { readBookingsDb } from "@/services/bookings/store";
import { readCgiDb } from "@/services/cgi/store";
import { verifyPassword } from "@/lib/security/crypto";

describe("permanent demo accounts", () => {
  beforeAll(() => {
    resetDemoEnvironment();
  });

  it("creates permanent role accounts as active and verified", () => {
    for (const email of Object.values(PRIMARY_DEMO_EMAILS)) {
      const user = findUserByEmail(email);
      expect(user, email).toBeTruthy();
      expect(user!.status).toBe("active");
      expect(user!.emailVerified).toBe(true);
      expect(user!.avatarUrl).toBeTruthy();
      expect(isPermanentDemoEmail(email)).toBe(true);
    }
  });

  it("assigns correct roles", () => {
    expect(findUserByEmail(PRIMARY_DEMO_EMAILS.superAdmin)?.role).toBe(ROLES.SUPER_ADMIN);
    expect(findUserByEmail(PRIMARY_DEMO_EMAILS.student)?.role).toBe(ROLES.STUDENT);
    expect(findUserByEmail(PRIMARY_DEMO_EMAILS.instructor)?.role).toBe(ROLES.INSTRUCTOR);
    expect(findUserByEmail(PRIMARY_DEMO_EMAILS.cgi)?.role).toBe(ROLES.CHIEF_GROUND_INSTRUCTOR);
  });

  it("stores temporary demo password hashes", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    expect(student.passwordHash).toBeTruthy();
    expect(student.passwordSalt).toBeTruthy();
    expect(
      verifyPassword(DEMO_ACCOUNT_PASSWORD, student.passwordHash!, student.passwordSalt!),
    ).toBe(true);
  });

  it("completes primary student profile", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    expect(student.profileComplete).toBe(true);
    expect(student.phone).toBeTruthy();
    expect(student.countryCode).toBeTruthy();
    expect(student.timezone).not.toBe("UTC");
  });

  it("enrols primary student in ATPL subjects", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const enrollments = readCoursesDb().enrollments.filter(
      (e) => e.studentId === student.id && e.status === "approved",
    );
    const atplCourseIds = new Set(
      readCoursesDb()
        .courses.filter((c) => c.code?.startsWith("ATPL-") && c.status === "published")
        .map((c) => c.id),
    );
    const atplEnrollments = enrollments.filter((e) => atplCourseIds.has(e.courseId));
    expect(atplEnrollments.length).toBeGreaterThanOrEqual(Math.min(3, atplCourseIds.size));
  });

  it("seeds demo notifications and bookings for the primary student", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const notes = readAuthDb().notifications.filter(
      (n) => n.userId === student.id && n.data?.demoSeed === true,
    );
    expect(notes.length).toBeGreaterThanOrEqual(3);
    const bookings = readBookingsDb().bookings.filter((b) => b.studentId === student.id);
    expect(bookings.length).toBeGreaterThanOrEqual(1);
  });

  it("seeds CGI subject plan for the primary student", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const plan = readCgiDb().subjectAssignments.filter((s) => s.studentId === student.id);
    expect(plan.length).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent", () => {
    const before = readCoursesDb().enrollments.length;
    ensureDemoUsersSeeded();
    ensurePlatformDemoEnvironment();
    expect(readCoursesDb().enrollments.length).toBe(before);
  });

  it("remaps EagerPilots demo emails without changing user ids", () => {
    const student = findUserByEmail(PRIMARY_DEMO_EMAILS.student)!;
    const previousId = student.id;
    writeAuthDb((d) => {
      const row = d.users.find((u) => u.id === previousId);
      if (row) row.email = "student.one@eagerpilots.com";
      d.otps.push({
        id: "legacy-demo-otp",
        email: "student.one@eagerpilots.com",
        userId: previousId,
        purpose: "login",
        codeHash: "x",
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
        resendCount: 0,
        rememberMe: false,
        lockedUntil: null,
        resendAvailableAt: null,
        pendingRegistrationId: null,
        meta: {},
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
        deviceLabel: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        verifiedAt: null,
        createdAt: new Date().toISOString(),
      });
      d.notifications.push({
        id: "legacy-demo-note",
        userId: previousId,
        title: "Welcome student.one@eagerpilots.com",
        body: "Sign in as student.one@eagerpilots.com",
        channel: "in_app",
        type: "system",
        data: {},
        readAt: null,
        createdAt: new Date().toISOString(),
      });
    });

    ensureDemoUsersSeeded();

    const remapped = findUserByEmail("student.one@eagerpilots.com")!;
    expect(remapped.id).toBe(previousId);
    expect(remapped.email).toBe(PRIMARY_DEMO_EMAILS.student);
    expect(findUserByEmail(PRIMARY_DEMO_EMAILS.student)?.id).toBe(previousId);
    expect(readAuthDb().users.some((u) => u.email.toLowerCase().endsWith("@eagerpilots.com"))).toBe(
      false,
    );
    expect(readAuthDb().otps.find((o) => o.id === "legacy-demo-otp")?.email).toBe(
      PRIMARY_DEMO_EMAILS.student,
    );
    const note = readAuthDb().notifications.find((n) => n.id === "legacy-demo-note");
    expect(note?.title).toContain(PRIMARY_DEMO_EMAILS.student);
    expect(note?.body).not.toContain("eagerpilots.com");
  });
});

describe("demo email aliases", () => {
  it("keeps every catalog mailbox on aviatorpass.com", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(account.email.endsWith("@aviatorpass.com")).toBe(true);
      expect(account.email.toLowerCase()).not.toContain("eagerpilots.com");
    }
    expect(PRIMARY_DEMO_EMAILS.superAdmin).toBe("superadmin@aviatorpass.com");
    expect(PRIMARY_DEMO_EMAILS.student).toBe("student@aviatorpass.com");
    expect(PRIMARY_DEMO_EMAILS.instructor).toBe("instructor@aviatorpass.com");
    expect(PRIMARY_DEMO_EMAILS.cgi).toBe("cgi@aviatorpass.com");
  });

  it("maps the four primary EagerPilots mailboxes to AviatorPass", () => {
    expect(remapLegacyDemoEmail("superadmin@eagerpilots.com")).toBe(PRIMARY_DEMO_EMAILS.superAdmin);
    expect(remapLegacyDemoEmail("student.one@eagerpilots.com")).toBe(PRIMARY_DEMO_EMAILS.student);
    expect(remapLegacyDemoEmail("instructor.one@eagerpilots.com")).toBe(
      PRIMARY_DEMO_EMAILS.instructor,
    );
    expect(remapLegacyDemoEmail("cgi@eagerpilots.com")).toBe(PRIMARY_DEMO_EMAILS.cgi);
    expect(canonicalDemoEmail("Student.One@EagerPilots.com")).toBe(PRIMARY_DEMO_EMAILS.student);
    expect(isPermanentDemoEmail("instructor.one@eagerpilots.com")).toBe(true);
  });
});
