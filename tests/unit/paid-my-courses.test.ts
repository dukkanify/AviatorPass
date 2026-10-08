import { beforeAll, describe, expect, it } from "vitest";

import { ATPL_PACKAGE_LMS_COURSE_CODES } from "@/constants/atpl-complete-package";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { writeAuthDb } from "@/services/auth/store";
import { ATPL_PENDING_INSTRUCTOR_ASSIGNMENT } from "@/constants/atpl-complete-package";
import {
  getStudentAtplPackageSchedule,
  hydratePaidAtplStudentAccess,
  rebindPaidPackageOrdersToLiveUsers,
} from "@/services/cgi/journey-service";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { writeCoursesDb } from "@/services/courses/store";
import { listMyCourses } from "@/services/learning/learning-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";

function seedPaidGuestBuyer(prefix: string) {
  const stamp = Date.now();
  const email = `${prefix}.${stamp}@aviatorpass.test`;
  const studentId = `student-${prefix}-${stamp}`;
  const orderId = `order-${prefix}-${stamp}`;
  const now = new Date().toISOString();

  writeAuthDb((db) => {
    db.users.push({
      id: studentId,
      email,
      firstName: "Aziz",
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
      orderNumber: `INV-TEST-${stamp}`,
      studentId: "guest",
      studentName: "Aziz Buyer",
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
      idempotencyKey: `paid-my-courses-${stamp}`,
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

describe("paid ATPL my courses", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
  });

  it("rebinds a guest paid package onto the live student and lists official subjects", async () => {
    const { email, studentId, orderId } = seedPaidGuestBuyer("guest-rebind");

    const rebound = rebindPaidPackageOrdersToLiveUsers();
    expect(rebound).toBeGreaterThan(0);

    await hydratePaidAtplStudentAccess(studentId, email);

    expect(readPaymentsDb().orders.find((row) => row.id === orderId)?.studentId).toBe(studentId);

    const enrolled = listStudentEnrollments(studentId);
    expect(enrolled.length).toBeGreaterThanOrEqual(ATPL_PACKAGE_LMS_COURSE_CODES.length);

    const courses = listMyCourses(studentId);
    expect(courses.map((course) => course.code).sort()).toEqual(
      [...ATPL_PACKAGE_LMS_COURSE_CODES].sort(),
    );
    expect(courses.some((course) => course.title === "Instrumentation")).toBe(true);
    expect(courses.some((course) => course.title === "Air Law")).toBe(true);

    const schedule = getStudentAtplPackageSchedule(studentId, email);
    expect(schedule.packageOwned).toBe(true);
    expect(schedule.instructorAssignmentStatus).toBe("pending");
    expect(schedule.instructorAssignmentLabel).toBe(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);
  });

  it("lists enrolled ATPL subjects by course id instead of a catalog page", async () => {
    const { email, studentId } = seedPaidGuestBuyer("catalog-miss");
    await hydratePaidAtplStudentAccess(studentId, email);

    const enrolled = listStudentEnrollments(studentId);
    expect(enrolled.length).toBeGreaterThan(0);

    writeCoursesDb((db) => {
      const keep = new Set(enrolled.map((row) => row.courseId));
      for (const course of db.courses) {
        if (keep.has(course.id)) course.updatedAt = "2000-01-01T00:00:00.000Z";
      }
    });

    const courses = listMyCourses(studentId);
    expect(courses).toHaveLength(enrolled.length);
    expect(courses.every((course) => enrolled.some((row) => row.courseId === course.id))).toBe(
      true,
    );
  });

  it("still lists official subjects when enrollments point at missing course ids", async () => {
    const { email, studentId } = seedPaidGuestBuyer("orphan-enroll");
    await hydratePaidAtplStudentAccess(studentId, email);

    writeCoursesDb((db) => {
      for (const enrollment of db.enrollments) {
        if (enrollment.studentId === studentId) {
          enrollment.courseId = `missing-${enrollment.courseId}`;
          enrollment.notes = "ATPL Complete Package";
        }
      }
    });

    const courses = listMyCourses(studentId);
    expect(courses.length).toBeGreaterThanOrEqual(ATPL_PACKAGE_LMS_COURSE_CODES.length);
    expect(courses.some((course) => course.title === "Instrumentation")).toBe(true);
  });
});
