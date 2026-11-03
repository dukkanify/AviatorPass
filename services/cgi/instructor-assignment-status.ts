/**
 * Official ATPL post-payment status: Pending Instructor Assignment
 * until TKI 1 assigns a theoretical-knowledge instructor.
 */

import { ATPL_PENDING_INSTRUCTOR_ASSIGNMENT } from "@/constants/atpl-complete-package";
import { findUserById } from "@/services/auth/store";
import { readCgiDb } from "@/services/cgi/store";
import { writePaymentsDb } from "@/services/payments/store";
import type { Order } from "@/types/payments";

export type InstructorAssignmentStatus = "pending" | "assigned";

export type InstructorAssignmentSnapshot = {
  instructorAssignmentStatus: InstructorAssignmentStatus;
  instructorAssignmentLabel: string;
  assignedTkLabel: string | null;
  assignedInstructorName: string | null;
  instructorAssignedAt: string | null;
};

export function emptyInstructorAssignmentSnapshot(pending = false): InstructorAssignmentSnapshot {
  return {
    instructorAssignmentStatus: pending ? "pending" : "pending",
    instructorAssignmentLabel: pending ? ATPL_PENDING_INSTRUCTOR_ASSIGNMENT : "",
    assignedTkLabel: null,
    assignedInstructorName: null,
    instructorAssignedAt: null,
  };
}

export function markAtplInstructorAssignmentPending(orderId: string): void {
  const stamp = new Date().toISOString();
  writePaymentsDb((db) => {
    const order = db.orders.find((row) => row.id === orderId);
    if (!order) return;
    if (order.metadata.instructorAssignmentStatus === "assigned") return;
    order.metadata = {
      ...order.metadata,
      instructorAssignmentStatus: "pending",
      instructorAssignmentLabel: ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
    };
    order.updatedAt = stamp;
  });
}

export function markAtplInstructorAssignmentAssigned(input: {
  studentId?: string | null;
  tkLabel: string;
  instructorName: string;
}): void {
  if (!input.studentId) return;
  const stamp = new Date().toISOString();
  writePaymentsDb((db) => {
    const order = db.orders.find(
      (row) =>
        row.studentId === input.studentId &&
        (row.status === "paid" || Boolean(row.metadata.firstInstallmentPaidAt)) &&
        (/ATPL/i.test(row.items[0]?.productName ?? "") ||
          row.metadata.sku === "ATPL-PACKAGE" ||
          row.metadata.instructorAssignmentStatus === "pending" ||
          Boolean(row.metadata.purchaseFirst)),
    );
    if (!order) return;
    order.metadata = {
      ...order.metadata,
      instructorAssignmentStatus: "assigned",
      instructorAssignmentLabel: `${input.tkLabel} has been assigned to you.`,
      assignedTkLabel: input.tkLabel,
      assignedInstructorName: input.instructorName,
      instructorAssignedAt: stamp,
    };
    order.updatedAt = stamp;
  });
}

function storedAssignment(
  order: Pick<Order, "metadata"> | null | undefined,
  status: "assigned" | "pending",
): InstructorAssignmentSnapshot {
  const tkLabel =
    typeof order?.metadata.assignedTkLabel === "string" ? order.metadata.assignedTkLabel : null;
  const name =
    typeof order?.metadata.assignedInstructorName === "string"
      ? order.metadata.assignedInstructorName
      : null;
  return {
    instructorAssignmentStatus: status,
    instructorAssignmentLabel:
      typeof order?.metadata.instructorAssignmentLabel === "string"
        ? order.metadata.instructorAssignmentLabel
        : status === "assigned"
          ? tkLabel
            ? `${tkLabel} has been assigned to you.`
            : "Instructor assigned"
          : ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
    assignedTkLabel: tkLabel,
    assignedInstructorName: name,
    instructorAssignedAt:
      typeof order?.metadata.instructorAssignedAt === "string"
        ? order.metadata.instructorAssignedAt
        : null,
  };
}

/** A booked lecture means TKI 1 already placed an instructor, even if the order flag is still pending. */
function assignmentFromBookedLecture(studentId: string): InstructorAssignmentSnapshot | null {
  const lecture = readCgiDb().lectureAssignments.find(
    (row) => row.studentId === studentId && row.status !== "cancelled" && row.instructorId,
  );
  if (!lecture) return null;
  const instructor = findUserById(lecture.instructorId);
  const name = instructor
    ? [instructor.firstName, instructor.lastName].filter(Boolean).join(" ").trim() ||
      instructor.email
    : null;
  return {
    instructorAssignmentStatus: "assigned",
    instructorAssignmentLabel: name ? `${name} has been assigned to you.` : "Instructor assigned",
    assignedTkLabel: null,
    assignedInstructorName: name,
    instructorAssignedAt: lecture.createdAt ?? lecture.updatedAt ?? null,
  };
}

export function instructorAssignmentFromOrder(
  order: Pick<Order, "metadata"> | null | undefined,
  studentId?: string | null,
): InstructorAssignmentSnapshot {
  const status = order?.metadata?.instructorAssignmentStatus;
  if (status === "assigned") return storedAssignment(order, "assigned");

  if (studentId) {
    const booked = assignmentFromBookedLecture(studentId);
    if (booked) return booked;
  }

  if (status === "pending") return storedAssignment(order, "pending");

  return {
    instructorAssignmentStatus: "pending",
    instructorAssignmentLabel: ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
    assignedTkLabel: null,
    assignedInstructorName: null,
    instructorAssignedAt: null,
  };
}
