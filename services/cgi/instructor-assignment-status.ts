/**
 * Official ATPL post-payment status: Pending Instructor Assignment
 * until TKI 1 assigns a theoretical-knowledge instructor.
 */

import { ATPL_PENDING_INSTRUCTOR_ASSIGNMENT } from "@/constants/atpl-complete-package";
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

export function instructorAssignmentFromOrder(
  order: Pick<Order, "metadata"> | null | undefined,
  studentId?: string | null,
): InstructorAssignmentSnapshot {
  const status = order?.metadata?.instructorAssignmentStatus;
  if (status === "assigned" || status === "pending") {
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

  if (studentId) {
    const lectures = readCgiDb().lectureAssignments.filter(
      (row) => row.studentId === studentId && row.status !== "cancelled",
    );
    if (lectures.length > 0) {
      return {
        instructorAssignmentStatus: "assigned",
        instructorAssignmentLabel: "Instructor assigned",
        assignedTkLabel: null,
        assignedInstructorName: null,
        instructorAssignedAt: lectures[0]?.createdAt ?? null,
      };
    }
  }

  return {
    instructorAssignmentStatus: "pending",
    instructorAssignmentLabel: ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
    assignedTkLabel: null,
    assignedInstructorName: null,
    instructorAssignedAt: null,
  };
}
