/**
 * Seed default certificate template + sample issued certificates for demo student.
 */

import { generateId } from "@/lib/security/crypto";
import { publicCertificateVerifyUrl } from "@/lib/site-origin";
import { createHash, randomBytes } from "node:crypto";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb, toUserProfile } from "@/services/auth/store";
import { ROLES } from "@/constants/roles";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listCourses } from "@/services/courses/course-service";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { DEFAULT_CERTIFICATE_BODY, CERTIFICATE_TEMPLATE_FIELDS } from "@/constants/certificates";
import { makeCourseCertificateNumber } from "@/lib/certificates/certificate-number";
import { resolveCertificateSubjectName } from "@/lib/certificates/subject-name";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import { readCertificatesDb, writeCertificatesDb } from "@/services/certificates/store";
import type { Certificate, CertificateTemplate } from "@/types/certificates";

function demoCoursesForStudent(studentId: string) {
  const enrolled = new Set(
    listStudentEnrollments(studentId)
      .filter((row) => row.status === "approved" || row.status === "completed")
      .map((row) => row.courseId),
  );
  const published = listCourses({ pageSize: 80, status: "published" }).data.filter(
    (course) => !course.deletedAt,
  );
  const fromEnrollment = published.filter((course) => enrolled.has(course.id));
  return fromEnrollment.length ? fromEnrollment : published.slice(0, 1);
}

function buildCertificate(input: {
  student: ReturnType<typeof toUserProfile>;
  courseId: string;
  courseCode: string | null;
  courseTitle: string;
  templateId: string;
  instructorId: string | null;
  instructorName: string;
  stamp: string;
  suffix: string;
}): Certificate {
  const courseName = resolveCertificateSubjectName({
    courseId: input.courseId,
    fallback: input.courseTitle,
  });
  const certificateNumber = makeCourseCertificateNumber({
    courseId: input.courseId,
    courseCode: input.courseCode,
    courseTitle: courseName,
    suffix: input.suffix,
  });
  const verificationCode = randomBytes(8).toString("hex").toUpperCase();
  return {
    id: generateId(),
    certificateNumber,
    verificationCode,
    studentId: input.student.id,
    studentName: input.student.fullName || input.student.email,
    courseId: input.courseId,
    courseName,
    instructorId: input.instructorId,
    instructorName: input.instructorName,
    templateId: input.templateId,
    status: "issued",
    issueMode: "automatic",
    completionDate: input.stamp.slice(0, 10),
    issueDate: input.stamp.slice(0, 10),
    expiresAt: null,
    revokedAt: null,
    revokeReason: null,
    reissuedFromId: null,
    digitalSignature: createHash("sha256")
      .update(`${certificateNumber}|${input.student.id}|${input.courseId}`)
      .digest("hex"),
    qrPayload: publicCertificateVerifyUrl(verificationCode),
    approvedById: input.instructorId,
    approvedAt: input.stamp,
    metadata: { seeded: true },
    createdById: input.instructorId,
    createdAt: input.stamp,
    updatedAt: input.stamp,
  };
}

function healSeededCertificates(): void {
  const db = readCertificatesDb();
  const stamp = new Date().toISOString();
  writeCertificatesDb((d) => {
    d.templates = d.templates.map((template) =>
      template.isDefault || !/<h1>\{\{organizationName\}\}/.test(template.bodyHtml)
        ? {
            ...template,
            bodyHtml: DEFAULT_CERTIFICATE_BODY,
            fields: [...CERTIFICATE_TEMPLATE_FIELDS],
            updatedAt: stamp,
          }
        : template,
    );
  });

  const hasDemoRow = readCertificatesDb().certificates.some((row) => row.metadata?.seeded);
  if (!hasDemoRow) return;

  const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active");
  if (!student) return;
  const instructor = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR);
  const template = readCertificatesDb().templates.find((t) => t.isDefault) ?? db.templates[0];
  if (!template) return;
  const profile = toUserProfile(student);
  const instructorName = instructor
    ? toUserProfile(instructor).fullName || instructor.email
    : "Faculty";
  const existingCourseIds = new Set(
    readCertificatesDb()
      .certificates.filter((c) => c.studentId === student.id && c.courseId)
      .map((c) => c.courseId),
  );
  const additions: Certificate[] = [];
  demoCoursesForStudent(student.id).forEach((course, index) => {
    if (existingCourseIds.has(course.id)) return;
    additions.push(
      buildCertificate({
        student: profile,
        courseId: course.id,
        courseCode: course.code,
        courseTitle: course.title,
        templateId: template.id,
        instructorId: instructor?.id ?? null,
        instructorName,
        stamp,
        suffix: `DEMO${String(index + 1).padStart(2, "0")}`,
      }),
    );
  });
  if (!additions.length) return;
  writeCertificatesDb((d) => {
    d.certificates = [...additions, ...d.certificates];
    d.completions.push(
      ...additions.map((c) => ({
        id: generateId(),
        studentId: c.studentId,
        courseId: c.courseId!,
        completedAt: stamp,
        progressPercent: 100,
        learningHours: 12,
        certificateId: c.id,
        createdAt: stamp,
      })),
    );
  });
}

export function ensureCertificatesSeeded(): void {
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  const db = readCertificatesDb();
  if (db.seeded && db.templates.length > 0) {
    healSeededCertificates();
    return;
  }

  const brand = getPublicBrandConfig();
  const stamp = new Date().toISOString();
  const template: CertificateTemplate = {
    id: generateId(),
    name: "AviatorPass Classic",
    description: "Default landscape certificate with brand colors and QR verification.",
    isDefault: true,
    logoUrl: brand.logoUrl,
    backgroundUrl: null,
    primaryColor: brand.primaryColor || "#143048",
    accentColor: brand.accentColor || "#CCA04C",
    signatureName: "AviatorPass Academic Board",
    signatureTitle: "Director of Training",
    signatureImageUrl: null,
    bodyHtml: DEFAULT_CERTIFICATE_BODY,
    fields: [...CERTIFICATE_TEMPLATE_FIELDS],
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
  };

  const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active");
  const instructor = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR);
  const certificates: Certificate[] = [];

  if (student) {
    const profile = toUserProfile(student);
    const instructorName = instructor
      ? toUserProfile(instructor).fullName || instructor.email
      : "Faculty";
    demoCoursesForStudent(student.id).forEach((course, index) => {
      certificates.push(
        buildCertificate({
          student: profile,
          courseId: course.id,
          courseCode: course.code,
          courseTitle: course.title,
          templateId: template.id,
          instructorId: instructor?.id ?? null,
          instructorName,
          stamp,
          suffix: `DEMO${String(index + 1).padStart(2, "0")}`,
        }),
      );
    });
  }

  writeCertificatesDb((d) => {
    d.templates = [template];
    d.certificates = certificates;
    d.completions = certificates.map((c) => ({
      id: generateId(),
      studentId: c.studentId,
      courseId: c.courseId!,
      completedAt: stamp,
      progressPercent: 100,
      learningHours: 12,
      certificateId: c.id,
      createdAt: stamp,
    }));
    d.seeded = true;
  });
}
