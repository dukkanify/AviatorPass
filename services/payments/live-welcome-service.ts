/**
 * Official PPL / Basics Live Online journey: welcome email 3 days after payment.
 *
 * Recorded SKUs and ATPL/ELP keep their own mail. This is the delayed live-program
 * welcome (instructor, timetable, start-today) for PPL-LIVE and BASICS-LIVE.
 */

import { ROLES } from "@/constants/roles";
import { JOURNEY_COURSES } from "@/services/journeys/customer-journey-catalog";
import { findUserById, readAuthDb } from "@/services/auth/store";
import { getCourseById } from "@/services/courses/course-service";
import { dispatchEmailEvent } from "@/services/email/automation-service";
import { notifyUsers } from "@/services/notifications/notification-service";
import { getProduct } from "@/services/payments/catalog-service";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import type { Order, OrderItem } from "@/types/payments";

export const LIVE_PROGRAM_WELCOME_SKUS = ["PPL-LIVE", "BASICS-LIVE"] as const;
export const LIVE_PROGRAM_WELCOME_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

export type LiveWelcomeSchedule = {
  orderId: string;
  dueAt: string;
  courseName: string;
  sku: string;
};

function personName(
  user:
    | { firstName?: string | null; lastName?: string | null; email?: string | null }
    | null
    | undefined,
  fallback: string,
) {
  if (!user) return fallback;
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || fallback;
}

function productSku(item: OrderItem): string {
  const product = getProduct(item.productId);
  return String(product?.metadata?.sku ?? "")
    .trim()
    .toUpperCase();
}

export function liveProgramWelcomeItems(order: Order): OrderItem[] {
  return order.items.filter((item) => {
    const sku = productSku(item);
    if (sku === "ATPL-PACKAGE" || sku === "ELP-MOCK") return false;
    if ((LIVE_PROGRAM_WELCOME_SKUS as readonly string[]).includes(sku)) return true;
    if (!item.courseId) return false;
    const course = getCourseById(item.courseId);
    return course?.deliveryType === "live" && /LIVE/i.test(course.code);
  });
}

function journeyMetaForItem(item: OrderItem) {
  const sku = productSku(item);
  const def = JOURNEY_COURSES.find((row) => row.sku === sku);
  const course = item.courseId ? getCourseById(item.courseId) : null;
  return {
    sku: sku || def?.sku || course?.code || "LIVE",
    courseName: def?.title ?? course?.title ?? item.productName,
    weeks: def?.programWeeks ?? null,
    lectures: def?.lectureCount ?? null,
    instructorId: item.instructorId ?? course?.primaryInstructorId ?? null,
  };
}

export function scheduleLiveProgramWelcome(
  order: Order,
  options?: { delayMs?: number; now?: Date },
): LiveWelcomeSchedule | null {
  if (order.status !== "paid") return null;
  if (order.metadata.liveWelcomeSentAt) return null;
  const items = liveProgramWelcomeItems(order);
  if (!items.length) return null;

  const primary = journeyMetaForItem(items[0]!);
  const delay = options?.delayMs ?? LIVE_PROGRAM_WELCOME_DELAY_MS;
  const dueAt = new Date((options?.now ?? new Date()).getTime() + delay).toISOString();

  writePaymentsDb((db) => {
    const row = db.orders.find((item) => item.id === order.id);
    if (!row) return;
    row.metadata = {
      ...row.metadata,
      liveWelcomeDueAt: dueAt,
      liveWelcomeSku: primary.sku,
      liveWelcomeCourseName: primary.courseName,
    };
    row.updatedAt = new Date().toISOString();
  });

  return {
    orderId: order.id,
    dueAt,
    courseName: primary.courseName,
    sku: primary.sku,
  };
}

function getStoredOrder(orderId: string): Order | null {
  return readPaymentsDb().orders.find((row) => row.id === orderId) ?? null;
}

export async function sendLiveProgramWelcome(orderId: string): Promise<{
  sent: boolean;
  subject: string | null;
  notifiedUserIds: string[];
}> {
  const order = getStoredOrder(orderId);
  if (!order || order.status !== "paid") {
    return { sent: false, subject: null, notifiedUserIds: [] };
  }
  if (order.metadata.liveWelcomeSentAt) {
    return { sent: false, subject: null, notifiedUserIds: [] };
  }
  const items = liveProgramWelcomeItems(order);
  if (!items.length) {
    return { sent: false, subject: null, notifiedUserIds: [] };
  }

  const student = findUserById(order.studentId);
  const primary = journeyMetaForItem(items[0]!);
  const instructor = primary.instructorId ? findUserById(primary.instructorId) : null;
  const instructorName = personName(instructor, "AviatorPass Instructor");
  const studentName = personName(student, order.studentName || order.studentEmail);
  const weeks = primary.weeks ? `${primary.weeks}-week` : "live";
  const lectures = primary.lectures ? `${primary.lectures} lectures` : "scheduled Zoom sessions";
  const subject = `Welcome to ${primary.courseName} — your live program starts today`;
  const studentDetail = [
    `Your ${weeks} live program is ready.`,
    `Course: ${primary.courseName}.`,
    `Instructor: ${instructorName}.`,
    `Format: ${lectures} on Zoom.`,
    `Open My Courses and your timetable to join the first session.`,
  ].join(" ");
  const staffDetail = [
    `Student: ${studentName} (${order.studentEmail}).`,
    `Course: ${primary.courseName}.`,
    `The 3-day live welcome window is complete.`,
  ].join(" ");

  const auth = readAuthDb();
  const adminIds = auth.users
    .filter(
      (user) =>
        (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) && user.status === "active",
    )
    .map((user) => user.id);
  const notified = new Set<string>();

  if (student) {
    await notifyUsers([student.id], {
      title: subject,
      body: studentDetail,
      type: "student.live_welcome",
      email: false,
      actionUrl: "/student/courses",
      data: { orderId: order.id, sku: primary.sku },
    });
    await dispatchEmailEvent({
      event: "enrollment",
      userIds: [student.id],
      subject,
      data: {
        recipientName: studentName,
        title: primary.courseName,
        detail: studentDetail,
        cta: "Open My Courses",
        reference: order.orderNumber,
      },
      actorId: order.studentId,
      system: true,
      meta: { kind: "live_program_welcome", orderId: order.id, sku: primary.sku },
    });
    notified.add(student.id);
  }

  if (instructor) {
    await notifyUsers([instructor.id], {
      title: `Live program starting — ${primary.courseName}`,
      body: staffDetail,
      type: "instructor.student_assigned",
      email: false,
      actionUrl: "/instructor/dashboard",
      data: { orderId: order.id, studentId: order.studentId },
    });
    await dispatchEmailEvent({
      event: "instructor_alert",
      userIds: [instructor.id],
      subject: `Live program starting — ${studentName}`,
      data: {
        title: primary.courseName,
        detail: staffDetail,
        cta: "Open AviatorPass",
      },
      actorId: order.studentId,
      system: true,
      meta: { kind: "live_program_welcome", orderId: order.id, audience: "instructor" },
    });
    notified.add(instructor.id);
  }

  if (adminIds.length) {
    await notifyUsers(adminIds, {
      title: `Live welcome sent — ${primary.courseName}`,
      body: staffDetail,
      type: "admin.purchase",
      email: false,
      actionUrl: "/super-admin",
      data: { orderId: order.id },
    });
    await dispatchEmailEvent({
      event: "admin_alert",
      userIds: adminIds,
      subject: `Copy: ${subject}`,
      data: {
        title: primary.courseName,
        detail: staffDetail,
        reference: order.orderNumber,
      },
      actorId: order.studentId,
      system: true,
      meta: { kind: "live_program_welcome", orderId: order.id, audience: "admin" },
    });
    for (const id of adminIds) notified.add(id);
  }

  const stamp = new Date().toISOString();
  writePaymentsDb((db) => {
    const row = db.orders.find((item) => item.id === order.id);
    if (!row) return;
    row.metadata = {
      ...row.metadata,
      liveWelcomeSentAt: stamp,
    };
    row.updatedAt = stamp;
  });

  return { sent: true, subject, notifiedUserIds: [...notified] };
}

export async function processDueLiveProgramWelcomes(options?: { now?: Date; limit?: number }) {
  const now = (options?.now ?? new Date()).getTime();
  const limit = options?.limit ?? 25;
  const due = readPaymentsDb()
    .orders.filter((order) => {
      if (order.status !== "paid") return false;
      if (order.metadata.liveWelcomeSentAt) return false;
      const dueAt = String(order.metadata.liveWelcomeDueAt ?? "");
      if (!dueAt) return false;
      const parsed = Date.parse(dueAt);
      return Number.isFinite(parsed) && parsed <= now;
    })
    .slice(0, limit);

  const results: Array<{ orderId: string; sent: boolean; subject: string | null }> = [];
  for (const order of due) {
    const result = await sendLiveProgramWelcome(order.id);
    results.push({ orderId: order.id, sent: result.sent, subject: result.subject });
  }
  return { processed: results.length, sent: results.filter((row) => row.sent).length, results };
}
