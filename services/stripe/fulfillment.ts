/**
 * Enrolment + notifications after Stripe Checkout events.
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity } from "@/services/auth/activity-log";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import {
  enrollStudent,
  listStudentEnrollments,
  updateEnrollmentStatus,
} from "@/services/courses/enrollment-service";
import { CourseValidationError } from "@/services/courses/validation";
import { formatMinor } from "@/services/payments/money";
import { notifyPayment } from "@/services/payments/notify";
import { GUEST_STUDENT_ID } from "@/services/payments/purchase-first-service";
import { logStripeEvent } from "@/services/stripe/logging";
import { findCheckoutBySessionId, upsertCheckout } from "@/services/stripe/store";
import type { StripeCheckoutRecord, StripeLifecycleStatus } from "@/services/stripe/types";
import type { EnrollmentWithStudent } from "@/types/courses";

export async function ensurePendingEnrollment(input: {
  courseId: string;
  studentId: string;
  actorId: string | null;
}): Promise<EnrollmentWithStudent | null> {
  if (!input.courseId || !input.studentId || input.studentId === GUEST_STUDENT_ID) {
    return null;
  }
  const existing = listStudentEnrollments(input.studentId).find(
    (row) => row.courseId === input.courseId && !["dropped", "rejected"].includes(row.status),
  );
  if (existing) return existing;
  try {
    return await enrollStudent({
      courseId: input.courseId,
      studentId: input.studentId,
      status: "pending",
      notes: "Stripe Checkout — pending payment",
      actorId: input.actorId,
      bypassEnrollmentGate: true,
    });
  } catch (error) {
    if (error instanceof CourseValidationError && /already enrolled/i.test(error.message)) {
      return (
        listStudentEnrollments(input.studentId).find((row) => row.courseId === input.courseId) ??
        null
      );
    }
    logStripeEvent({
      level: "warn",
      message: "Could not create pending enrolment",
      details: {
        courseId: input.courseId,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
    return null;
  }
}

export async function activatePaidEnrollment(input: {
  courseId: string;
  studentId: string;
  actorId: string | null;
}): Promise<EnrollmentWithStudent | null> {
  if (!input.courseId || !input.studentId || input.studentId === GUEST_STUDENT_ID) {
    return null;
  }
  const existing = listStudentEnrollments(input.studentId).find(
    (row) => row.courseId === input.courseId && !["dropped", "rejected"].includes(row.status),
  );
  if (existing) {
    if (existing.status === "pending" || existing.status === "suspended") {
      return updateEnrollmentStatus({
        id: existing.id,
        status: "approved",
        actorId: input.actorId,
      });
    }
    return existing;
  }
  try {
    return await enrollStudent({
      courseId: input.courseId,
      studentId: input.studentId,
      status: "approved",
      notes: "Stripe Checkout — paid",
      actorId: input.actorId,
      bypassEnrollmentGate: true,
    });
  } catch (error) {
    if (error instanceof CourseValidationError && /already enrolled/i.test(error.message)) {
      return (
        listStudentEnrollments(input.studentId).find((row) => row.courseId === input.courseId) ??
        null
      );
    }
    throw error;
  }
}

export function patchCheckoutStatus(
  sessionId: string,
  patch: Partial<StripeCheckoutRecord> & { status: StripeLifecycleStatus },
): StripeCheckoutRecord | null {
  const current = findCheckoutBySessionId(sessionId);
  if (!current) return null;
  const next: StripeCheckoutRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    paidAt: patch.status === "paid" ? (current.paidAt ?? new Date().toISOString()) : current.paidAt,
  };
  return upsertCheckout(next);
}

export async function notifyPaymentSucceeded(input: {
  studentId: string;
  courseId: string;
  amount: number;
  currency: string;
  reference: string;
}) {
  if (!input.studentId || input.studentId === GUEST_STUDENT_ID) return;
  const amountLabel = formatMinor(input.amount, input.currency);
  await notifyPayment(input.studentId, {
    title: "Payment successful",
    body: `Your Aviator Pass payment of ${amountLabel} is confirmed and your enrolment is active.`,
    type: "payment.succeeded",
    data: { courseId: input.courseId },
    amountLabel,
    reference: input.reference,
    actionUrl: "/student/dashboard",
    email: false,
  });
  await dispatchEmailEvent({
    event: "payment",
    userIds: [input.studentId],
    subject: "Aviator Pass payment confirmed",
    data: {
      title: "Payment confirmed",
      detail: `Your payment of ${amountLabel} succeeded. Your course is now available in My Courses.`,
      amount: amountLabel,
      reference: input.reference,
    },
    actorId: input.studentId,
    system: true,
  });
  await logActivity({
    actorId: input.studentId,
    action: ACTIVITY_ACTIONS.PAYMENT_COMPLETED,
    entityType: "payment",
    entityId: input.reference,
    metadata: { courseId: input.courseId, currency: input.currency },
  });
}

export async function notifyPaymentFailed(input: {
  studentId: string;
  courseId: string;
  amount: number;
  currency: string;
  reference: string;
  message?: string | null;
}) {
  if (!input.studentId || input.studentId === GUEST_STUDENT_ID) return;
  const amountLabel = formatMinor(input.amount, input.currency);
  await notifyPayment(input.studentId, {
    title: "Payment unsuccessful",
    body:
      input.message?.trim() ||
      `We could not complete your Aviator Pass payment of ${amountLabel}. Your enrolment stays pending until you retry.`,
    type: "payment.failed",
    data: { courseId: input.courseId },
    amountLabel,
    reference: input.reference,
    actionUrl: "/checkout",
    email: true,
  });
  await logActivity({
    actorId: input.studentId,
    action: ACTIVITY_ACTIONS.PAYMENT_FAILED,
    entityType: "payment",
    entityId: input.reference,
    metadata: { courseId: input.courseId, pendingEnrollment: true },
  });
}
