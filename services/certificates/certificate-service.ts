/**
 * Certificate issuance, approval, revocation, reissue.
 */

import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";

import { generateId } from "@/lib/security/crypto";
import { canonicalCertificateVerifyUrl, publicCertificateVerifyUrl } from "@/lib/site-origin";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { siteConfig } from "@/config/site";
import { logActivity } from "@/services/auth/activity-log";
import { readAuthDb, toUserProfile } from "@/services/auth/store";
import { getCourseById } from "@/services/courses/course-service";
import { getCourseLearningState } from "@/services/learning/progress-service";
import { assertCanManageCertificates, CertificateError } from "@/services/certificates/access";
import { getDefaultTemplate, getTemplateById } from "@/services/certificates/template-service";
import { readCertificatesDb, writeCertificatesDb } from "@/services/certificates/store";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import { DEFAULT_CERTIFICATE_BODY } from "@/constants/certificates";
import { resolveCertificateSubjectName } from "@/lib/certificates/subject-name";
import {
  alignCertificateNumber,
  makeCourseCertificateNumber,
} from "@/lib/certificates/certificate-number";
import { embedCertificateLogo } from "@/lib/certificates/print-logo";
import type { Certificate, CertificateIssueMode, CertificateStatus } from "@/types/certificates";
import type { UserProfile } from "@/types";

function nowIso() {
  return new Date().toISOString();
}

function makeCertificateNumber(input: {
  courseId?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
}): string {
  return makeCourseCertificateNumber({
    ...input,
    suffix: randomBytes(3).toString("hex").toUpperCase(),
  });
}

function presentCertificate(cert: Certificate): Certificate {
  const course = cert.courseId ? getCourseById(cert.courseId) : null;
  const courseName = resolveCertificateSubjectName({
    courseId: cert.courseId,
    fallback: cert.courseName,
  });
  const certificateNumber = alignCertificateNumber(cert.certificateNumber, {
    courseId: cert.courseId,
    courseCode: course?.code,
    courseTitle: courseName,
  });
  if (courseName === cert.courseName && certificateNumber === cert.certificateNumber) {
    return cert;
  }
  return { ...cert, courseName, certificateNumber };
}

function persistPresentedCertificate(cert: Certificate): Certificate {
  const next = presentCertificate(cert);
  if (next === cert) return withCanonicalQr(cert);
  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((row) => row.id === cert.id);
    if (idx >= 0) {
      d.certificates[idx] = { ...d.certificates[idx]!, ...next, updatedAt: nowIso() };
    }
  });
  return withCanonicalQr(next);
}

function makeVerificationCode(): string {
  return randomBytes(8).toString("hex").toUpperCase();
}

function signCertificatePayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function publicVerifyUrl(code: string): string {
  return publicCertificateVerifyUrl(code);
}

function withCanonicalQr(cert: Certificate): Certificate {
  return {
    ...cert,
    qrPayload: canonicalCertificateVerifyUrl(cert.qrPayload, cert.verificationCode),
  };
}

export function listCertificates(filters?: {
  studentId?: string;
  status?: CertificateStatus | "all";
  courseId?: string;
}): Certificate[] {
  let rows = readCertificatesDb().certificates;
  if (filters?.studentId) rows = rows.filter((c) => c.studentId === filters.studentId);
  if (filters?.courseId) rows = rows.filter((c) => c.courseId === filters.courseId);
  if (filters?.status && filters.status !== "all") {
    rows = rows.filter((c) => c.status === filters.status);
  }
  return [...rows]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(persistPresentedCertificate);
}

export function getCertificateById(id: string): Certificate | null {
  const cert = readCertificatesDb().certificates.find((c) => c.id === id) ?? null;
  return cert ? persistPresentedCertificate(cert) : null;
}

export function findCertificateByVerification(query: string): Certificate | null {
  const q = query.trim().toUpperCase();
  const cert =
    readCertificatesDb().certificates.find(
      (c) =>
        c.verificationCode.toUpperCase() === q ||
        c.certificateNumber.toUpperCase() === q ||
        c.id === query.trim(),
    ) ?? null;
  return cert ? persistPresentedCertificate(cert) : null;
}

export async function createCertificate(input: {
  user: UserProfile;
  studentId: string;
  courseId: string;
  templateId?: string | null;
  issueMode?: CertificateIssueMode;
  completionDate?: string;
  expiresAt?: string | null;
  autoApprove?: boolean;
}): Promise<Certificate> {
  assertCanManageCertificates(input.user);

  const existing = listCertificates({
    studentId: input.studentId,
    courseId: input.courseId,
  }).find((c) => c.status === "issued" || c.status === "pending_approval");
  if (existing) {
    throw new CertificateError(
      "An active or pending certificate already exists for this student and course",
    );
  }

  const student = readAuthDb().users.find((u) => u.id === input.studentId);
  if (!student) throw new CertificateError("Student not found", 404);
  const course = getCourseById(input.courseId);
  if (!course) throw new CertificateError("Course not found", 404);

  const template =
    (input.templateId ? getTemplateById(input.templateId) : null) ?? getDefaultTemplate();
  if (!template) throw new CertificateError("No certificate template configured");

  let instructorName = "AviatorPass Faculty";
  const instructorId: string | null = course.primaryInstructorId;
  if (instructorId) {
    const instructor = readAuthDb().users.find((u) => u.id === instructorId);
    if (instructor) instructorName = toUserProfile(instructor).fullName || "Faculty";
  }

  const stamp = nowIso();
  const verificationCode = makeVerificationCode();
  const certificateNumber = makeCertificateNumber({
    courseId: course.id,
    courseCode: course.code,
    courseTitle: course.title,
  });
  const qrPayload = publicVerifyUrl(verificationCode);
  const digitalSignature = signCertificatePayload(
    `${certificateNumber}|${input.studentId}|${input.courseId}|${verificationCode}`,
  );

  const autoApprove = input.autoApprove ?? input.issueMode === "automatic";
  const status: CertificateStatus = autoApprove ? "issued" : "pending_approval";

  const certificate: Certificate = {
    id: generateId(),
    certificateNumber,
    verificationCode,
    studentId: input.studentId,
    studentName: toUserProfile(student).fullName || student.email,
    courseId: input.courseId,
    courseName: resolveCertificateSubjectName({
      courseId: input.courseId,
      fallback: course.title,
    }),
    instructorId,
    instructorName,
    templateId: template.id,
    status,
    issueMode: input.issueMode ?? "manual",
    completionDate: input.completionDate ?? stamp.slice(0, 10),
    issueDate: autoApprove ? stamp.slice(0, 10) : null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    revokeReason: null,
    reissuedFromId: null,
    digitalSignature,
    qrPayload,
    approvedById: autoApprove ? input.user.id : null,
    approvedAt: autoApprove ? stamp : null,
    metadata: {},
    createdById: input.user.id,
    createdAt: stamp,
    updatedAt: stamp,
  };

  writeCertificatesDb((d) => {
    d.certificates.unshift(certificate);
    if (autoApprove) {
      d.completions.push({
        id: generateId(),
        studentId: input.studentId,
        courseId: input.courseId,
        completedAt: stamp,
        progressPercent: 100,
        learningHours: 0,
        certificateId: certificate.id,
        createdAt: stamp,
      });
    }
  });

  await logActivity({
    actorId: input.user.id,
    action: autoApprove
      ? ACTIVITY_ACTIONS.CERTIFICATE_ISSUED
      : ACTIVITY_ACTIONS.CERTIFICATE_CREATED,
    entityType: "certificate",
    entityId: certificate.id,
    metadata: { courseId: input.courseId, studentId: input.studentId },
  });

  if (autoApprove) {
    await dispatchEmailEvent({
      event: "certificate",
      userIds: [input.studentId],
      data: {
        title: course.title,
        reference: `${certificate.certificateNumber} · ${certificate.verificationCode}`,
        detail: "Your certificate has been issued and is ready to download.",
      },
      actorId: input.user.id,
      meta: { certificateId: certificate.id, courseId: input.courseId },
    });
    const { emitNotification } = await import("@/services/notifications/notification-service");
    await emitNotification({
      userId: input.studentId,
      type: "certificate.issued",
      title: "Certificate issued",
      body: `Your certificate for ${course.title} is ready.`,
      actionUrl: "/student/certificates",
      data: { certificateId: certificate.id, courseId: input.courseId },
      dedupeKey: `certificate:${certificate.id}`,
      email: false,
    });
  }

  return certificate;
}

/** Auto-issue when course learning progress reaches 100%. */
export async function maybeAutoIssueCertificate(input: {
  actor: UserProfile;
  studentId: string;
  courseId: string;
}): Promise<Certificate | null> {
  try {
    const state = getCourseLearningState(input.studentId, input.courseId);
    if (state.progressPercent < 100) return null;
  } catch {
    return null;
  }
  const existing = listCertificates({
    studentId: input.studentId,
    courseId: input.courseId,
  }).find((c) => ["issued", "pending_approval", "reissued"].includes(c.status));
  if (existing) return existing;

  return createCertificate({
    user: input.actor,
    studentId: input.studentId,
    courseId: input.courseId,
    issueMode: "automatic",
    autoApprove: true,
  });
}

export async function approveCertificate(user: UserProfile, id: string): Promise<Certificate> {
  assertCanManageCertificates(user);
  const existing = getCertificateById(id);
  if (!existing) throw new CertificateError("Certificate not found", 404);
  if (existing.status !== "pending_approval" && existing.status !== "draft") {
    throw new CertificateError("Certificate cannot be approved in its current status");
  }
  const stamp = nowIso();
  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((c) => c.id === id);
    if (idx >= 0) {
      d.certificates[idx] = {
        ...d.certificates[idx]!,
        status: "issued",
        issueDate: stamp.slice(0, 10),
        approvedById: user.id,
        approvedAt: stamp,
        updatedAt: stamp,
      };
    }
  });
  await logActivity({
    actorId: user.id,
    action: ACTIVITY_ACTIONS.CERTIFICATE_APPROVED,
    entityType: "certificate",
    entityId: id,
  });
  return getCertificateById(id)!;
}

export async function revokeCertificate(input: {
  user: UserProfile;
  id: string;
  reason: string;
}): Promise<Certificate> {
  assertCanManageCertificates(input.user);
  const existing = getCertificateById(input.id);
  if (!existing) throw new CertificateError("Certificate not found", 404);
  if (existing.status === "revoked") {
    throw new CertificateError("Certificate already revoked");
  }
  const stamp = nowIso();
  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      d.certificates[idx] = {
        ...d.certificates[idx]!,
        status: "revoked",
        revokedAt: stamp,
        revokeReason: input.reason || "Revoked by administrator",
        updatedAt: stamp,
      };
    }
  });
  await logActivity({
    actorId: input.user.id,
    action: ACTIVITY_ACTIONS.CERTIFICATE_REVOKED,
    entityType: "certificate",
    entityId: input.id,
    metadata: { reason: input.reason },
  });
  return getCertificateById(input.id)!;
}

export async function reissueCertificate(input: {
  user: UserProfile;
  id: string;
}): Promise<Certificate> {
  assertCanManageCertificates(input.user);
  const existing = getCertificateById(input.id);
  if (!existing) throw new CertificateError("Certificate not found", 404);
  if (!existing.courseId) throw new CertificateError("Cannot reissue without course");

  // Mark old as reissued lineage
  const stamp = nowIso();
  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((c) => c.id === input.id);
    if (idx >= 0 && d.certificates[idx]!.status === "issued") {
      d.certificates[idx] = {
        ...d.certificates[idx]!,
        status: "reissued",
        updatedAt: stamp,
      };
    }
  });

  const fresh = await createCertificate({
    user: input.user,
    studentId: existing.studentId,
    courseId: existing.courseId,
    templateId: existing.templateId,
    issueMode: "manual",
    completionDate: existing.completionDate,
    expiresAt: existing.expiresAt,
    autoApprove: true,
  });

  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((c) => c.id === fresh.id);
    if (idx >= 0) {
      d.certificates[idx] = {
        ...d.certificates[idx]!,
        reissuedFromId: existing.id,
        updatedAt: nowIso(),
      };
    }
  });

  await logActivity({
    actorId: input.user.id,
    action: ACTIVITY_ACTIONS.CERTIFICATE_REISSUED,
    entityType: "certificate",
    entityId: fresh.id,
    metadata: { from: existing.id },
  });

  return getCertificateById(fresh.id)!;
}

export async function updateCertificate(input: {
  user: UserProfile;
  id: string;
  patch: {
    studentName?: string;
    certificateNumber?: string;
    courseName?: string;
    courseId?: string | null;
    issueDate?: string | null;
    status?: CertificateStatus;
    instructorName?: string;
    instructorId?: string | null;
    verificationCode?: string;
    qrPayload?: string | null;
  };
}): Promise<Certificate> {
  assertCanManageCertificates(input.user);
  const existing = getCertificateById(input.id);
  if (!existing) throw new CertificateError("Certificate not found", 404);

  const studentName = input.patch.studentName?.trim() || existing.studentName;
  const certificateNumber = (
    input.patch.certificateNumber?.trim() || existing.certificateNumber
  ).toUpperCase();
  const verificationCode = (input.patch.verificationCode?.trim() || existing.verificationCode)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!studentName) throw new CertificateError("Student name is required");
  if (!certificateNumber) throw new CertificateError("Certificate number is required");
  if (verificationCode.length < 6) {
    throw new CertificateError("Verification code must be at least 6 characters");
  }

  if (
    input.patch.status &&
    !["draft", "pending_approval", "issued", "revoked", "expired", "reissued"].includes(
      input.patch.status,
    )
  ) {
    throw new CertificateError("Invalid certificate status", 400);
  }

  const duplicates = readCertificatesDb().certificates.filter((row) => row.id !== existing.id);
  if (duplicates.some((row) => row.certificateNumber.toUpperCase() === certificateNumber)) {
    throw new CertificateError("Certificate number already in use");
  }
  if (duplicates.some((row) => row.verificationCode.toUpperCase() === verificationCode)) {
    throw new CertificateError("Verification code already in use");
  }

  const qrPayload = publicVerifyUrl(verificationCode);
  const next: Certificate = {
    ...existing,
    studentName,
    certificateNumber,
    courseName: input.patch.courseName?.trim() || existing.courseName,
    courseId: input.patch.courseId !== undefined ? input.patch.courseId : existing.courseId,
    issueDate:
      input.patch.issueDate !== undefined
        ? input.patch.issueDate
          ? input.patch.issueDate.slice(0, 10)
          : null
        : existing.issueDate,
    status: input.patch.status ?? existing.status,
    instructorName: input.patch.instructorName?.trim() || existing.instructorName,
    instructorId:
      input.patch.instructorId !== undefined ? input.patch.instructorId : existing.instructorId,
    verificationCode,
    qrPayload,
    updatedAt: nowIso(),
  };

  writeCertificatesDb((d) => {
    const idx = d.certificates.findIndex((c) => c.id === existing.id);
    if (idx >= 0) d.certificates[idx] = next;
  });

  await logActivity({
    actorId: input.user.id,
    action: ACTIVITY_ACTIONS.CERTIFICATE_UPDATED,
    entityType: "certificate",
    entityId: next.id,
    metadata: { certificateNumber: next.certificateNumber },
  });

  return getCertificateById(next.id)!;
}

export async function renderCertificateHtml(certificateId: string): Promise<{
  html: string;
  certificate: Certificate;
  qrDataUrl: string;
}> {
  const certificate = getCertificateById(certificateId);
  if (!certificate) throw new CertificateError("Certificate not found", 404);
  const template = getTemplateById(certificate.templateId) ?? getDefaultTemplate();
  if (!template) throw new CertificateError("Template missing", 404);
  const brand = getPublicBrandConfig();
  const org = brand.platformName || siteConfig.name;

  const values: Record<string, string> = {
    studentName: certificate.studentName,
    courseName: resolveCertificateSubjectName({
      courseId: certificate.courseId,
      fallback: certificate.courseName,
    }),
    instructorName: certificate.instructorName,
    completionDate: certificate.completionDate,
    issueDate: certificate.issueDate ?? "—",
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    organizationName: org,
  };

  let body = /<h1>|<h3>/.test(template.bodyHtml) ? template.bodyHtml : DEFAULT_CERTIFICATE_BODY;
  for (const [key, value] of Object.entries(values)) {
    body = body.replaceAll(`{{${key}}}`, value);
  }

  const qrDataUrl = await QRCode.toDataURL(certificate.qrPayload, {
    margin: 1,
    width: 160,
    color: { dark: template.primaryColor, light: "#ffffff" },
  });

  const logo = embedCertificateLogo(template.logoUrl || brand.logoUrl);
  const navy = template.primaryColor || "#143048";
  const gold = template.accentColor || "#CCA04C";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${values.courseName} · ${certificate.certificateNumber}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap"/>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
    background: #f4f6f8;
    color: ${navy};
  }
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px;
  }
  .sheet {
    width: min(1100px, 100%);
    min-height: 720px;
    margin: 0 auto;
    padding: 36px 64px 32px;
    background: linear-gradient(180deg, #ffffff 0%, #faf7f2 100%);
    border: 10px solid ${navy};
    box-shadow: 0 12px 40px rgba(20, 48, 72, 0.12);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .status {
    position: absolute;
    top: 22px;
    right: 28px;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7C7B80;
  }
  .logo-wrap {
    display: flex;
    justify-content: center;
    width: 100%;
    margin: 8px 0 6px;
  }
  img.logo {
    display: block;
    height: 72px;
    width: auto;
    max-width: 440px;
    object-fit: contain;
    object-position: center;
  }
  .accent {
    width: 168px;
    height: 4px;
    margin: 18px auto 22px;
    background: ${gold};
    border-radius: 2px;
  }
  .centerpiece { width: min(780px, 100%); margin: 0 auto; }
  h1 {
    margin: 0 0 10px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    word-spacing: 0.28em;
  }
  .eyebrow {
    margin: 0 0 28px;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7C7B80;
  }
  .recipient, .body {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.02em;
    word-spacing: 0.08em;
    color: #7C7B80;
  }
  h2 {
    margin: 18px 0 16px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 40px;
    line-height: 1.25;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: ${gold};
  }
  h3 {
    margin: 16px 0 22px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    line-height: 1.35;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: ${navy};
  }
  .meta {
    margin: 0 0 12px;
    font-size: 15px;
    letter-spacing: 0.01em;
    word-spacing: 0.06em;
    color: ${navy};
  }
  .number {
    margin: 4px 0 0;
    font-family: ui-monospace, "IBM Plex Mono", monospace;
    font-size: 13px;
    letter-spacing: 0.08em;
    color: ${navy};
  }
  .footer {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 140px minmax(180px, 1fr);
    align-items: end;
    gap: 20px 36px;
    margin-top: auto;
    padding-top: 36px;
  }
  .sig {
    border-top: 1px solid ${navy};
    padding-top: 10px;
    min-width: 200px;
    font-size: 12px;
    line-height: 1.45;
  }
  .sig strong { display: block; font-size: 13px; }
  .sig.right { text-align: right; justify-self: end; }
  .qr { text-align: center; font-size: 10px; color: #7C7B80; }
  .qr img { display: block; margin: 0 auto 8px; }
  .verify {
    font-family: ui-monospace, monospace;
    letter-spacing: 0.04em;
    color: ${navy};
    word-break: break-all;
  }
  @media print {
    body { background: white; }
    .page { padding: 0; min-height: auto; }
    .sheet { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <div class="status">${certificate.status}</div>
      <div class="logo-wrap">
        <img class="logo" src="${logo}" alt="${org}" width="440" height="72"/>
      </div>
      <div class="accent"></div>
      ${body}
      <div class="footer">
        <div class="sig">
          <strong>${template.signatureName}</strong>
          <span>${template.signatureTitle}</span>
        </div>
        <div class="qr">
          <img src="${qrDataUrl}" alt="Verification QR" width="104" height="104"/>
          <div class="verify">${certificate.verificationCode}</div>
          <div>Scan to verify</div>
        </div>
        <div class="sig right">
          <strong>Digital signature</strong>
          <span>${certificate.digitalSignature.slice(0, 24)}…</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { html, certificate, qrDataUrl };
}
