import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { ATPL_PACKAGE_LMS_COURSE_CODES } from "@/constants/atpl-complete-package";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserById, toUserProfile, writeAuthDb } from "@/services/auth/store";
import { hydratePaidAtplStudentAccess } from "@/services/cgi/journey-service";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { getStudentOverview } from "@/services/dashboard/metrics";
import { getLearningDashboard, listMyCourses } from "@/services/learning/learning-service";
import { getOverallProgress } from "@/services/learning/progress-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { writePaymentsDb } from "@/services/payments/store";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function seedPaidStudent(prefix: string) {
  const stamp = Date.now();
  const email = `${prefix}.${stamp}@aviatorpass.test`;
  const studentId = `student-${prefix}-${stamp}`;
  const orderId = `order-${prefix}-${stamp}`;
  const now = new Date().toISOString();

  writeAuthDb((db) => {
    db.users.push({
      id: studentId,
      email,
      firstName: "Abdulaziz",
      lastName: "Buyer",
      phone: `+9655${String(stamp).slice(-7)}`,
      countryCode: "KW",
      nationality: "Kuwait",
      dateOfBirth: null,
      gender: null,
      city: null,
      bio: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      avatarUrl: null,
      timezone: "UTC",
      language: "en",
      role: ROLES.STUDENT,
      status: "active",
      emailVerified: true,
      profileComplete: true,
      mustChangePassword: false,
      passwordHash: null,
      passwordSalt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  writePaymentsDb((db) => {
    db.orders.unshift({
      id: orderId,
      orderNumber: `INV-DASH-${stamp}`,
      studentId,
      studentName: "Abdulaziz Buyer",
      studentEmail: email,
      status: "paid",
      currency: "KWD",
      subtotalAmount: 1000,
      discountAmount: 0,
      taxAmount: 0,
      taxRatePercent: 0,
      totalAmount: 1000,
      couponId: null,
      couponCode: null,
      billingName: "ABDULAZIZ ALSHOAIL",
      billingEmail: email,
      billingCountry: "KW",
      billingAddress: "Kuwait City",
      items: [
        {
          id: `item-${stamp}`,
          productId: "atpl-package",
          productName: "ATPL Complete Package",
          courseId: null,
          instructorId: null,
          pricingModel: "package",
          unitAmount: 1000,
          quantity: 1,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 1000,
        },
      ],
      paymentId: null,
      invoiceId: null,
      idempotencyKey: `paid-dashboard-${stamp}`,
      failureReason: null,
      paidAt: now,
      cancelledAt: null,
      expiresAt: null,
      metadata: {
        purchaseFirst: true,
        sku: "ATPL-PACKAGE",
        studyStartDate: "2026-11-01",
        firstLectureTime: "16:00",
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return { email, studentId, orderId };
}

describe("paid student dashboard load", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("does not rewrite the course catalog or demo progress on a seeded read", () => {
    const courses = src("services/courses/seed.ts");
    const start = courses.indexOf("export function ensureCoursesSeeded");
    const seeded = courses.slice(start, start + 400);
    expect(seeded).toContain("if (db.seeded && db.courses.length > 0)");
    expect(seeded).not.toContain("ensurePublishedCatalogEnrichment");
    const learning = src("services/learning/seed.ts");
    const learn = learning.slice(
      learning.indexOf("export function ensureLearningSeeded"),
      learning.indexOf("export function ensureLearningSeeded") + 280,
    );
    expect(learn).toMatch(/if \(db\.seeded\) return;/);
    expect(learn).not.toMatch(/db\.progress\.length > 0/);
  });

  it("does not rewrite the payment ledger on a covered student hydrate", () => {
    const journey = src("services/cgi/journey-service.ts");
    const start = journey.indexOf("export async function hydratePaidAtplStudentAccess");
    const end = journey.indexOf("async function maybeSendPackageConfirmationFollowup");
    const hydrate = journey.slice(start, end);
    expect(hydrate).toMatch(/if \(studentHasOfficialPackageCoverage\(/);
    expect(hydrate.indexOf("studentHasOfficialPackageCoverage")).toBeLessThan(
      hydrate.indexOf("ensurePaymentsSeeded"),
    );
    expect(journey).toContain("function patchPaidOrder");
    expect(journey).toContain("upsertOrder(current)");
    expect(
      journey.slice(start, journey.indexOf("async function ensureAtplPackageSubjectCoverage")),
    ).not.toContain("writePaymentsDb");
  });

  it("does not walk course graphs for untouched enrollments", () => {
    const progress = src("services/learning/progress-service.ts");
    const start = progress.indexOf("export function getOverallProgress");
    const end = progress.indexOf("export async function touchLessonProgress");
    const body = progress.slice(start, end);
    expect(body).toContain("startedCourseIds");
    expect(body).toMatch(/if \(!startedCourseIds\.has\(/);
  });

  it("does not rebuild the full learning dashboard for student metrics", () => {
    const metrics = src("services/dashboard/metrics.ts");
    expect(metrics).not.toMatch(/import \{ getLearningDashboard \}/);
    const start = metrics.indexOf("export function getStudentOverview");
    const end = metrics.indexOf("function listCoursesForMetrics");
    const body = metrics.slice(start, end);
    expect(body).toContain("getOverallProgress");
    expect(body).not.toContain("getLearningDashboard");
    expect(body).not.toContain("listWrittenAttempts");
    expect(body).not.toContain("listCertificates");
    const route = src("app/api/dashboard/metrics/route.ts");
    const student = route.slice(
      route.indexOf("if (scope === ROLES.STUDENT)"),
      route.indexOf("const activity ="),
    );
    expect(student).toContain("activity: []");
    expect(student).not.toContain("getRecentActivityFeed");
  });

  it("keeps paid student enrollment reads off the course catalog", () => {
    const enrollment = src("services/courses/enrollment-service.ts");
    const start = enrollment.indexOf("export function listStudentEnrollments");
    const body = enrollment.slice(start, start + 220);
    expect(body).toContain("listEnrollmentsForStudent");
    expect(body).not.toContain("ensureCoursesSeeded");
    const journey = src("services/cgi/journey-service.ts");
    const coverage = journey.slice(
      journey.indexOf("function studentHasOfficialPackageCoverage"),
      journey.indexOf("function listOfficialPackageSubjectProgress"),
    );
    expect(coverage).toContain("listEnrollmentsForStudent");
    expect(coverage).not.toContain("officialPackageCourses");
    const timetable = journey.slice(
      journey.indexOf("export async function ensureConfirmedFirstLectureOnTimetable"),
      journey.indexOf("const FIRST_LECTURE_LESSON_ID"),
    );
    expect(timetable).toContain("listOfficialPackageSubjectProgress");
    expect(timetable).not.toContain("latestPaidPackageSchedule");
    expect(timetable).not.toContain("resolveLivePaidStudent");
  });

  it("does not hydrate classes or the certificate catalog on student widget GETs", () => {
    const calendar = src("app/api/learning/calendar/route.ts");
    expect(calendar).toContain("ensureConfirmedFirstLectureOnTimetable");
    expect(calendar).not.toContain("getLearningCalendar");
    expect(calendar).toContain("firstLectureSubjectTitle");
    const certs = src("app/api/certificates/route.ts");
    const get = certs.slice(
      certs.indexOf("export async function GET"),
      certs.indexOf("export async function POST"),
    );
    const student = get.slice(0, get.indexOf("ensureCertificatesSeeded"));
    expect(student).toContain("listEnrollmentsForStudent");
    expect(student).toContain("ROLES.STUDENT");
    expect(student).not.toContain("ensureCertificatesSeeded");
  });

  it("skips first-lesson syllabus lookup when the student has not started", () => {
    const learning = src("services/learning/learning-service.ts");
    const start = learning.indexOf("export function getResumeTarget");
    const end = learning.indexOf("export function emptyLearningDashboardOverview");
    const body = learning.slice(start, end);
    expect(body).toContain("return null;");
    expect(body).not.toContain("getCourseDetail(course.id)");
  });

  it("returns an overview and My Courses for a paid student who has not started", async () => {
    const { email, studentId } = seedPaidStudent("dash-load");
    await hydratePaidAtplStudentAccess(studentId, email);

    const enrolled = listStudentEnrollments(studentId).filter((row) =>
      ["approved", "completed", "pending"].includes(row.status),
    );
    expect(enrolled.length).toBeGreaterThanOrEqual(ATPL_PACKAGE_LMS_COURSE_CODES.length);

    const overall = getOverallProgress(studentId);
    expect(overall.activeCourses).toBe(enrolled.length);
    expect(overall.progressPercent).toBe(0);
    expect(overall.completedCourses).toBe(0);

    const user = findUserById(studentId);
    expect(user).toBeTruthy();
    const dashboard = getLearningDashboard(toUserProfile(user!));
    expect(dashboard.activeCourses).toBe(enrolled.length);
    expect(dashboard.resume).toBeNull();

    const courses = listMyCourses(studentId);
    expect(courses.length).toBeGreaterThanOrEqual(ATPL_PACKAGE_LMS_COURSE_CODES.length);
    expect(courses.every((course) => (course.learning?.progressPercent ?? 0) === 0)).toBe(true);

    const metrics = getStudentOverview(studentId);
    expect(metrics.currentCourses).toBe(enrolled.length);
    expect(metrics.progress).toBe(0);
    expect(metrics.learningHours).toBe(0);
  });
});
