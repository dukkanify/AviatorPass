import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ATPL_COMPLETE_PACKAGE_SUBJECTS,
  ATPL_PACKAGE_JOINING_TERMS,
  ATPL_PACKAGE_MIN_NOTICE_HOURS,
  ATPL_PACKAGE_TKI_NOTICE,
  atplPackageScheduleIssue,
  formatLocalDateInput,
  validAtplPackageSchedule,
} from "@/constants/atpl-complete-package";
import { ACTION_LABELS } from "@/constants/programme-terms";
import { listAtplPackageReviewSubjects } from "@/services/marketing/atpl-package-review";
import {
  listPublicAtplSubjects,
  updateAtplLandingSubject,
} from "@/services/marketing/atpl-subjects-service";
import { resetAtplMarketingDbForTests } from "@/services/marketing/atpl-subjects-store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getWelcomeByOrderId, payGuestCheckout } from "@/services/payments/purchase-first-service";
import { guestCheckoutSchema } from "@/utils/validation";

const CLIENT_TITLES = [
  "Instrumentation",
  "General Navigation",
  "Radio Navigation",
  "Meteorology",
  "Human Performance and Limitations",
  "Aircraft General Knowledge",
  "Air Law",
  "Flight Planning and Monitoring",
  "Performance",
  "Operational Procedures",
  "Principles of Flight",
  "Mass and Balance",
  "Communications",
];

describe("ATPL Complete Package journey", () => {
  beforeEach(() => {
    resetAtplMarketingDbForTests();
  });

  it("reviews the client's 13 subjects in the agreed order", () => {
    expect(ATPL_COMPLETE_PACKAGE_SUBJECTS).toHaveLength(13);
    expect(ATPL_COMPLETE_PACKAGE_SUBJECTS.map((s) => s.title)).toEqual(CLIENT_TITLES);
    const review = listAtplPackageReviewSubjects();
    expect(review).toHaveLength(13);
    expect(review.map((s) => s.title)).toEqual(CLIENT_TITLES);
    expect(review.every((s) => s.shortDescription.trim().length > 0)).toBe(true);
    expect(review.map((s) => s.title)).not.toContain("Dynamic Management");
    expect(listPublicAtplSubjects()).toHaveLength(16);
  });

  it("keeps hidden CMS extras off the package review without dropping a required subject", async () => {
    const airLaw = listPublicAtplSubjects().find((s) => s.code === "010");
    expect(airLaw).toBeTruthy();
    await updateAtplLandingSubject({
      id: airLaw!.id,
      patch: { visible: false },
    });
    expect(listPublicAtplSubjects().some((s) => s.code === "010")).toBe(false);
    expect(
      listAtplPackageReviewSubjects().some((s) => s.code === "010" && s.title === "Air Law"),
    ).toBe(true);
  });

  it("requires a first lecture at least 72 hours ahead", () => {
    const tooSoon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(atplPackageScheduleIssue(formatLocalDateInput(tooSoon), "10:00")).toMatch(/72 hours/);
    const ok = validAtplPackageSchedule();
    expect(atplPackageScheduleIssue(ok.studyStartDate, ok.firstLectureTime)).toBeNull();
    expect(ATPL_PACKAGE_MIN_NOTICE_HOURS).toBe(72);
    expect(ATPL_PACKAGE_TKI_NOTICE).toMatch(/TKI 1/);
    expect(ATPL_PACKAGE_JOINING_TERMS.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects guest checkout payloads without a valid package schedule", () => {
    const base = {
      firstName: "Lina",
      lastName: "Pilot",
      email: "lina.schedule@aviatorpass.test",
      phone: "+96550001111",
      country: "KW",
    };
    expect(guestCheckoutSchema.safeParse(base).success).toBe(false);
    expect(
      guestCheckoutSchema.safeParse({
        ...base,
        studyStartDate: formatLocalDateInput(new Date()),
        firstLectureTime: "09:00",
      }).success,
    ).toBe(false);
    expect(guestCheckoutSchema.safeParse({ ...base, ...validAtplPackageSchedule() }).success).toBe(
      true,
    );
  });

  it("stores the requested start on the paid order and welcome snapshot", async () => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
    const schedule = validAtplPackageSchedule();
    const result = await payGuestCheckout({
      firstName: "Huda",
      lastName: "Farid",
      email: `package.schedule.${Date.now()}@aviatorpass.test`,
      phone: "+96550007777",
      country: "KW",
      billingName: "Huda Farid",
      billingAddress: "Kuwait City",
      ...schedule,
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `package-schedule-${Date.now()}`,
    });
    expect(result.order.status).toBe("paid");
    expect(result.order.metadata.studyStartDate).toBe(schedule.studyStartDate);
    expect(result.order.metadata.firstLectureTime).toBe(schedule.firstLectureTime);
    expect(result.order.metadata.scheduleProvisional).toBe(true);
    expect(String(result.order.metadata.scheduleNotice)).toMatch(/TKI 1/);
    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome?.studyStartDate).toBe(schedule.studyStartDate);
    expect(welcome?.firstLectureTime).toBe(schedule.firstLectureTime);
  });

  it("keeps checkout on the guest form so the schedule is collected before Stripe", () => {
    const checkoutPage = readFileSync(
      path.join(process.cwd(), "app/(marketing)/checkout/page.tsx"),
      "utf8",
    );
    expect(checkoutPage).toContain("GuestCheckoutView");
    expect(checkoutPage).not.toContain("startHostedCheckout");
    expect(checkoutPage).not.toContain("StripeCheckoutRedirect");

    const checkoutView = readFileSync(
      path.join(process.cwd(), "features/payments/components/guest-checkout-view.tsx"),
      "utf8",
    );
    expect(checkoutView).toContain("studyStartDate");
    expect(checkoutView).toContain("firstLectureTime");
    expect(checkoutView).toContain("ATPL_PACKAGE_TKI_NOTICE");

    const program = readFileSync(
      path.join(process.cwd(), "features/marketing/components/atpl-program-page.tsx"),
      "utf8",
    );
    expect(program).toContain("joining-terms");
    expect(program).toContain("ATPL_PACKAGE_JOINING_TERMS");
    expect(program).toContain("ACTION_LABELS.chooseThisPackage");
    expect(ACTION_LABELS.chooseThisPackage).toBe("Choose this package");
  });
});
