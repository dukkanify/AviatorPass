/**
 * Official ATPL delivery gaps: EUR installments, pending assignment, later invoices.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ATPL_PENDING_INSTRUCTOR_ASSIGNMENT } from "@/constants/atpl-complete-package";
import { generateId } from "@/lib/security/crypto";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb, toUserProfile } from "@/services/auth/store";
import { notifyAtplInstructorAssigned } from "@/services/cgi/assignment-email";
import { getStudentAtplPackageSchedule } from "@/services/cgi/journey-service";
import {
  officialAtplEurInstallmentAmounts,
  officialAtplEurTotalMinor,
  usesOfficialAtplEurInstallments,
} from "@/services/payments/atpl-official-installments";
import { createCheckoutOrder, payOrder } from "@/services/payments/checkout-service";
import {
  createInstallmentPlanForOrder,
  listScheduleForPlan,
} from "@/services/payments/installment-service";
import { listInvoices } from "@/services/payments/invoice-service";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";

function studentUser() {
  const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT && u.status === "active");
  if (!student) throw new Error("Student required");
  return toUserProfile(student);
}

function atplProduct() {
  const product = readPaymentsDb().products.find((p) => p.metadata?.sku === "ATPL-PACKAGE");
  if (!product) throw new Error("ATPL package required");
  return product;
}

function seedPassport(userId: string) {
  writePaymentsDb((db) => {
    db.kycDocuments.unshift({
      id: generateId(),
      userId,
      kind: "passport",
      status: "uploaded",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storagePath: "/tmp/passport.pdf",
      publicUrl: null,
      rejectionReason: null,
      verifiedAt: null,
      verifiedById: null,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

describe("official ATPL delivery", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
    ensurePaymentsSeeded();
  });

  it("uses official EUR 2000 + 4x1000 only outside KW/AE/SA", () => {
    expect(usesOfficialAtplEurInstallments("DE", "ATPL-PACKAGE")).toBe(true);
    expect(usesOfficialAtplEurInstallments("US", "ATPL-PACKAGE")).toBe(true);
    expect(usesOfficialAtplEurInstallments("KW", "ATPL-PACKAGE")).toBe(false);
    expect(usesOfficialAtplEurInstallments("AE", "ATPL-PACKAGE")).toBe(false);
    expect(usesOfficialAtplEurInstallments("SA", "ATPL-PACKAGE")).toBe(false);
    expect(officialAtplEurInstallmentAmounts().reduce((a, b) => a + b, 0)).toBe(
      officialAtplEurTotalMinor(),
    );
  });

  it("requires school name and stores the official EUR schedule", async () => {
    const user = studentUser();
    seedPassport(user.id);
    const order = await createCheckoutOrder({
      user,
      productId: atplProduct().id,
      billingName: user.fullName || user.email,
      billingEmail: user.email,
      billingCountry: "DE",
      idempotencyKey: `eur-plan-${Date.now()}`,
    });
    await expect(
      createInstallmentPlanForOrder({
        order,
        user,
        mode: "installments",
        agreementAccepted: true,
        actorId: user.id,
      }),
    ).rejects.toThrow(/School name/);

    const plan = await createInstallmentPlanForOrder({
      order,
      user,
      mode: "installments",
      agreementAccepted: true,
      schoolName: "Lufthansa Aviation Training",
      actorId: user.id,
    });
    expect(plan.currency).toBe("EUR");
    expect(plan.installmentCount).toBe(5);
    expect(plan.totalAmount).toBe(officialAtplEurTotalMinor());
    expect(plan.metadata.schoolName).toBe("Lufthansa Aviation Training");
    expect(listScheduleForPlan(plan.id).map((row) => row.amount)).toEqual(
      officialAtplEurInstallmentAmounts(),
    );
  }, 60_000);

  it("issues a new invoice and receipt on a later installment payment", async () => {
    const user = studentUser();
    seedPassport(user.id);
    const order = await createCheckoutOrder({
      user,
      productId: atplProduct().id,
      billingName: user.fullName || user.email,
      billingEmail: user.email,
      billingCountry: "KW",
      idempotencyKey: `later-inv-${Date.now()}`,
    });
    const first = await payOrder({
      user,
      orderId: order.id,
      methodBrand: "visa",
      paymentToken: "tok_ok",
      paymentMode: "installments",
      installmentCount: 4,
      agreementAccepted: true,
    });
    const planId = String(first.order.metadata.installmentPlanId ?? "");
    const schedule = listScheduleForPlan(planId);
    expect(schedule).toHaveLength(4);
    const firstInvoices = listInvoices({ studentId: user.id }).filter(
      (invoice) => invoice.orderId === order.id,
    );
    expect(firstInvoices.length).toBeGreaterThanOrEqual(1);

    const next = schedule.find((row) => row.status === "due" || row.status === "upcoming");
    expect(next).toBeTruthy();
    await payOrder({
      user,
      orderId: order.id,
      methodBrand: "visa",
      paymentToken: "tok_ok",
      scheduleItemId: next!.id,
    });
    const invoices = listInvoices({ studentId: user.id }).filter(
      (invoice) => invoice.orderId === order.id,
    );
    expect(invoices.length).toBeGreaterThanOrEqual(2);
    expect(invoices.some((invoice) => invoice.paymentId === first.payment.id)).toBe(true);
    expect(
      invoices.some((invoice) => /Installment 2 of 4/.test(invoice.items[0]?.description ?? "")),
    ).toBe(true);
  }, 90_000);

  it("shows Pending Instructor Assignment until TKI 1 assigns an instructor", async () => {
    const user = studentUser();
    const instructor = readAuthDb().users.find(
      (u) => u.role === ROLES.INSTRUCTOR && u.status === "active",
    );
    expect(instructor).toBeTruthy();
    const order = await createCheckoutOrder({
      user,
      productId: atplProduct().id,
      billingName: user.fullName || user.email,
      billingEmail: user.email,
      billingCountry: "AE",
      idempotencyKey: `pending-assign-${Date.now()}`,
    });
    const paid = await payOrder({
      user,
      orderId: order.id,
      methodBrand: "visa",
      paymentToken: "tok_ok",
      paymentMode: "full",
      agreementAccepted: true,
    });
    expect(paid.order.status).toBe("paid");
    expect(paid.order.metadata.instructorAssignmentStatus).toBe("pending");
    const before = getStudentAtplPackageSchedule(user.id, user.email);
    expect(before.instructorAssignmentStatus).toBe("pending");
    expect(before.instructorAssignmentLabel).toBe(ATPL_PENDING_INSTRUCTOR_ASSIGNMENT);

    await notifyAtplInstructorAssigned({
      instructorId: instructor!.id,
      studentId: user.id,
      lessonTitle: "Instrumentation",
      actorId: instructor!.id,
    });
    const after = getStudentAtplPackageSchedule(user.id, user.email);
    expect(after.instructorAssignmentStatus).toBe("assigned");
    expect(after.instructorAssignmentLabel).toMatch(/has been assigned to you/);
  }, 90_000);
});
