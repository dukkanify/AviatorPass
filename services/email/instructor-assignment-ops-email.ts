/**
 * Support + CEO notice after an ATPL package is paid and still
 * Pending Instructor Assignment.
 */

import {
  ATPL_COMPLETE_PACKAGE_NAME,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
} from "@/constants/atpl-complete-package";
import { COUNTRIES } from "@/constants/countries";
import { PAYMENT_METHOD_LABELS } from "@/constants/payments";
import { routes } from "@/constants/routes";
import { PROJECT_SUPPORT_EMAIL } from "@/lib/branding/legacy-client-identity";
import { publicAppOrigin } from "@/lib/site-origin";
import { findUserById } from "@/services/auth/store";
import { sendEmail } from "@/services/email/mailer";
import { renderBrandedEmail } from "@/services/settings/email-templates";
import { formatMinor } from "@/services/payments/money";
import {
  getOrderById,
  getPaymentById,
  listPaymentsForOrder,
  upsertOrder,
} from "@/lib/data/lms-payment-ledger-store";
import type { Order } from "@/types/payments";

export const AVIATORPASS_CEO_EMAIL = "ceo@aviatorpass.com";

export const INSTRUCTOR_ASSIGNMENT_OPS_RECIPIENTS = [
  PROJECT_SUPPORT_EMAIL,
  AVIATORPASS_CEO_EMAIL,
] as const;

export type InstructorAssignmentOpsEmailInput = {
  studentName: string;
  studentEmail: string;
  phone: string;
  country: string;
  registrationDate: string;
  packageName: string;
  preferredStartDate: string;
  preferredTrainingTime: string;
  paymentMethod: string;
  amountLabel: string;
  adminDashboardUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countryName(code: string): string {
  return COUNTRIES.find((row) => row.code === code.toUpperCase())?.name ?? code;
}

function formatDate(iso: string): string {
  const value = iso.trim();
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function listItem(label: string, value: string, emphasize = false): string {
  const shown = escapeHtml(value || "—");
  return `<li><strong>${escapeHtml(label)}:</strong> ${
    emphasize ? `<span style="color:#B42318;font-weight:700;">${shown}</span>` : shown
  }</li>`;
}

export function instructorAssignmentOpsSubject(studentName: string): string {
  return `Action Required | New Student Registration – Instructor Assignment Pending | ${studentName.trim() || "Student"}`;
}

export function studentAtplPurchaseSubject(): string {
  return "Welcome to Aviator Pass";
}

/** Student letter sent once the ATPL Complete Package payment succeeds. */
export function renderStudentAtplPurchaseEmail(input: InstructorAssignmentOpsEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = studentAtplPurchaseSubject();
  const bodyHtml = `
    <p>Dear ${escapeHtml(input.studentName)},</p>
    <p>Welcome to Aviator Pass!</p>
    <p>We are pleased to confirm that your registration for the <strong>${escapeHtml(input.packageName)}</strong> has been successfully completed, and your payment has been received.</p>
    <p>Thank you for choosing Aviator Pass as your partner in your aviation training journey.</p>
    <p><strong>Registration Details</strong></p>
    <ul>
      ${listItem("Student Name", input.studentName)}
      ${listItem("Selected Package", input.packageName)}
      ${listItem("Registration Date", input.registrationDate)}
      ${listItem("Registration Status", ATPL_PENDING_INSTRUCTOR_ASSIGNMENT, true)}
    </ul>
    <p><strong>Payment Confirmation</strong></p>
    <ul>
      ${listItem("Amount Paid", input.amountLabel)}
      ${listItem("Payment Method", input.paymentMethod)}
      ${listItem("Payment Date", input.registrationDate)}
    </ul>
    <p>Your payment receipt and invoice are attached to this email for your records.</p>
    <p><strong>Need Assistance?</strong></p>
    <p>If you have any questions regarding your registration, payment, or training arrangements, please contact our support team at:</p>
    <p><strong>${escapeHtml(PROJECT_SUPPORT_EMAIL)}</strong></p>
    <p>We look forward to supporting you throughout your ATPL studies.</p>
  `;
  const rendered = renderBrandedEmail({
    title: "Welcome to Aviator Pass",
    preheader: `Your ${input.packageName} registration is confirmed.`,
    bodyHtml,
  });
  return { subject, html: rendered.html, text: rendered.text };
}

export async function sendStudentAtplPurchaseEmail(order: Order): Promise<boolean> {
  const to = order.studentEmail?.trim();
  if (!to) return false;
  const input = opsEmailInputFromOrder(order);
  const rendered = renderStudentAtplPurchaseEmail(input);
  const mail = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    meta: {
      kind: "student_atpl_purchase",
      orderId: order.id,
      studentEmail: to,
    },
  });
  return mail.success;
}

export function renderInstructorAssignmentPendingOpsEmail(
  input: InstructorAssignmentOpsEmailInput,
): { subject: string; html: string; text: string } {
  const subject = instructorAssignmentOpsSubject(input.studentName);
  const dashboard = escapeHtml(input.adminDashboardUrl);
  const bodyHtml = `
    <p>Dear Team,</p>
    <p>A new student has successfully registered for the <strong>${escapeHtml(input.packageName)}</strong> through Aviator Pass, and their payment has been confirmed.</p>
    <p>The registration is now awaiting instructor assignment.</p>
    <p><strong>Student Information</strong></p>
    <ul>
      ${listItem("Full Name", input.studentName)}
      ${listItem("Email Address", input.studentEmail)}
      ${listItem("Contact Number", input.phone)}
      ${listItem("Country", input.country)}
      ${listItem("Registration Date", input.registrationDate)}
    </ul>
    <p><strong>Training Details</strong></p>
    <ul>
      ${listItem("Selected Package", input.packageName)}
      ${listItem("Preferred Start Date", input.preferredStartDate)}
      ${listItem("Preferred Training Time", input.preferredTrainingTime)}
      ${listItem("Registration Status", ATPL_PENDING_INSTRUCTOR_ASSIGNMENT, true)}
    </ul>
    <p><strong>Payment Information</strong></p>
    <ul>
      ${listItem("Payment Status", "Confirmed")}
      ${listItem("Payment Method", input.paymentMethod)}
      ${listItem("Total Package Price", input.amountLabel)}
      ${listItem("Amount Received", input.amountLabel)}
    </ul>
    <p><strong>Action Required – Instructor Assignment</strong></p>
    <p>Please access the <a href="${dashboard}">Aviator Pass Admin Dashboard</a> and assign an available Theoretical Knowledge Instructor (TKI).</p>
    <p>Best regards,<br/>Aviator Pass Automated Notification System<br/>${escapeHtml(PROJECT_SUPPORT_EMAIL)}</p>
    <p>This is an automated notification. No reply is required. Please complete the instructor assignment through the Admin Dashboard.</p>
  `;
  const rendered = renderBrandedEmail({
    title: subject,
    preheader: `${input.studentName} paid for ${input.packageName}. ${ATPL_PENDING_INSTRUCTOR_ASSIGNMENT}.`,
    bodyHtml,
  });
  return { subject, html: rendered.html, text: rendered.text };
}

function isPaidAtplOrder(order: Order): boolean {
  const unlocked = order.status === "paid" || Boolean(order.metadata.firstInstallmentPaidAt);
  if (!unlocked) return false;
  return (
    /ATPL/i.test(order.items[0]?.productName ?? "") ||
    order.metadata.sku === "ATPL-PACKAGE" ||
    Boolean(order.metadata.purchaseFirst)
  );
}

function opsEmailInputFromOrder(order: Order): InstructorAssignmentOpsEmailInput {
  const user = findUserById(order.studentId);
  const studentName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    order.studentName ||
    "Student";
  const payment = order.paymentId
    ? getPaymentById(order.paymentId)
    : (listPaymentsForOrder(order.id)[0] ?? null);
  const method =
    (payment?.methodBrand && PAYMENT_METHOD_LABELS[payment.methodBrand]) ||
    (payment?.provider === "stripe" ? "Credit Card" : payment?.provider) ||
    "Credit Card";
  const start =
    typeof order.metadata.requestedStudyStartDate === "string"
      ? order.metadata.requestedStudyStartDate
      : typeof order.metadata.studyStartDate === "string"
        ? order.metadata.studyStartDate
        : "";
  const time =
    typeof order.metadata.requestedFirstLectureTime === "string"
      ? order.metadata.requestedFirstLectureTime
      : typeof order.metadata.firstLectureTime === "string"
        ? order.metadata.firstLectureTime
        : "";
  return {
    studentName,
    studentEmail: user?.email || order.studentEmail || order.billingEmail,
    phone: user?.phone || String(order.metadata.guestPhone || "—"),
    country: countryName(
      user?.countryCode || String(order.metadata.guestCountry || order.billingCountry || ""),
    ),
    registrationDate: formatDate(order.paidAt || order.createdAt),
    packageName: order.items[0]?.productName || ATPL_COMPLETE_PACKAGE_NAME,
    preferredStartDate: formatDate(start),
    preferredTrainingTime: time || "—",
    paymentMethod: method,
    amountLabel: formatMinor(order.totalAmount, order.currency),
    adminDashboardUrl: `${publicAppOrigin()}${routes.cgiDashboard}`,
  };
}

/** Send the Support + CEO assignment-pending notice once per paid ATPL order. */
export async function notifyInstructorAssignmentPendingOps(order: Order): Promise<number> {
  if (!isPaidAtplOrder(order)) return 0;
  if (order.metadata.instructorAssignmentStatus === "assigned") return 0;
  if (order.metadata.opsInstructorAssignmentEmailAt) return 0;

  const input = opsEmailInputFromOrder(order);
  const rendered = renderInstructorAssignmentPendingOpsEmail(input);
  let sent = 0;
  for (const to of INSTRUCTOR_ASSIGNMENT_OPS_RECIPIENTS) {
    const mail = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      meta: {
        kind: "instructor_assignment_ops",
        orderId: order.id,
        studentEmail: input.studentEmail,
      },
    });
    if (mail.success) sent += 1;
  }
  if (sent > 0) {
    const stamp = new Date().toISOString();
    const current = getOrderById(order.id) ?? order;
    current.metadata = {
      ...current.metadata,
      opsInstructorAssignmentEmailAt: stamp,
    };
    current.updatedAt = stamp;
    upsertOrder(current);
  }
  return sent;
}
