/**
 * Official ELP Mock Exam customer journey (hours, Zoom name, emails, documents).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { formatMockExamMeetingTopic, zonedWallTimeToUtc } from "@/lib/datetime/zoned";
import { ROLES } from "@/constants/roles";
import { ELP_PAGE, ONLINE_COURSE_PROGRAMMES } from "@/features/marketing/content/online-courses";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import { getLatestOutboundTo } from "@/services/email/outbox";
import { getMockExamSlots } from "@/services/mock-exams/availability-service";
import {
  attachMockExamDocument,
  bookMockExam,
  getPublicElpCatalog,
  updateMockExamSettings,
} from "@/services/mock-exams/booking-service";
import { ensureCustomerJourneyProducts } from "@/services/journeys/customer-journey-catalog";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { readPaymentsDb } from "@/services/payments/store";
import {
  defaultMockExamSettings,
  ensureMockExamsSeeded,
  readMockExamsDb,
  resetMockExamsDbCache,
  writeMockExamsDb,
} from "@/services/mock-exams/store";

describe("ELP mock exam customer journey", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    resetMockExamsDbCache();
    writeMockExamsDb((db) => {
      db.sessions = [];
      db.certificates = [];
      db.seeded = true;
      db.settings = {
        ...defaultMockExamSettings(),
        minNoticeMinutes: 0,
        autoCreateZoom: true,
        autoIssueCertificate: true,
      };
      for (const fee of db.extraFees) {
        if (fee.code === "RUSH_12H" || fee.code === "RUSH_24H") {
          fee.active = true;
          fee.autoApply = true;
        }
      }
    });
  });

  it("keeps Mon–Fri 17–20 and Sat–Sun 09–18 in Kuwait time", () => {
    const tuesday = "2026-10-06"; // Tuesday
    const saturday = "2026-10-10";
    const examiner = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    const elp = readMockExamsDb().examTypes.find((t) => t.code === "ELP-MOCK")!;
    const week = getMockExamSlots({
      date: tuesday,
      examinerId: examiner.id,
      examTypeId: elp.id,
    }).filter((s) => s.available);
    const weekend = getMockExamSlots({
      date: saturday,
      examinerId: examiner.id,
      examTypeId: elp.id,
    }).filter((s) => s.available);

    expect(week.length).toBeGreaterThan(0);
    expect(weekend.length).toBeGreaterThan(0);
    const firstWeek = new Date(week[0]!.startsAt);
    expect(
      firstWeek.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Kuwait",
        hour: "2-digit",
        hourCycle: "h23",
      }),
    ).toBe("17");
    const morningKuwait = zonedWallTimeToUtc(tuesday, 10, 0, "Asia/Kuwait").toISOString();
    expect(week.some((s) => s.startsAt === morningKuwait)).toBe(false);
    const morningSat = zonedWallTimeToUtc(saturday, 9, 0, "Asia/Kuwait").toISOString();
    expect(weekend.some((s) => s.startsAt === morningSat)).toBe(true);
  });

  it("names the Zoom room Mock Exam / family name / date", () => {
    expect(
      formatMockExamMeetingTopic({
        lastName: "Alshoail",
        startsAt: "2026-08-15T14:00:00.000Z",
        timeZone: "Asia/Kuwait",
      }),
    ).toBe("Mock Exam / Alshoail / 15-Aug-2026");
  });

  it("emails student, instructor, and Super Admin after a paid booking", async () => {
    const student = readAuthDb().users.find(
      (u) => u.role === ROLES.STUDENT && u.status === "active",
    )!;
    const examiner = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    const elp = readMockExamsDb().examTypes.find((t) => t.code === "ELP-MOCK")!;
    const slots = getMockExamSlots({
      date: "2026-10-10",
      examinerId: examiner.id,
      examTypeId: elp.id,
    }).filter((s) => s.available);
    expect(slots[0]).toBeTruthy();

    const session = await bookMockExam({
      studentId: student.id,
      examinerId: examiner.id,
      examTypeId: elp.id,
      startsAt: slots[0]!.startsAt,
      markPaid: true,
      actorId: student.id,
    });
    expect(session.zoom?.joinUrl).toBeTruthy();
    expect(session.zoom?.topic).toBe(
      formatMockExamMeetingTopic({
        lastName: student.lastName || "Student",
        startsAt: session.startsAt,
        timeZone: "Asia/Kuwait",
      }),
    );
    expect(getLatestOutboundTo(student.email)?.subject).toMatch(/mock exam/i);
    expect(getLatestOutboundTo(examiner.email)?.subject).toMatch(/mock exam/i);
    expect(getLatestOutboundTo("support@aviatorpass.com")?.subject).toMatch(/mock exam/i);
  });

  it("saves examiner documents on the student session", async () => {
    const student = readAuthDb().users.find(
      (u) => u.role === ROLES.STUDENT && u.status === "active",
    )!;
    const examiner = readAuthDb().users.find((u) => u.role === ROLES.INSTRUCTOR)!;
    const elp = readMockExamsDb().examTypes.find((t) => t.code === "ELP-MOCK")!;
    const slots = getMockExamSlots({
      date: "2026-10-10",
      examinerId: examiner.id,
      examTypeId: elp.id,
    }).filter((s) => s.available);
    const session = await bookMockExam({
      studentId: student.id,
      examinerId: examiner.id,
      examTypeId: elp.id,
      startsAt: slots[0]!.startsAt,
      markPaid: true,
      actorId: student.id,
    });
    const updated = attachMockExamDocument({
      sessionId: session.id,
      name: "Pronunciation notes",
      url: "https://example.com/notes.pdf",
      actorId: examiner.id,
    });
    expect(updated.documents).toHaveLength(1);
    expect(updated.documents[0]?.name).toBe("Pronunciation notes");
  });

  it("does not overwrite Super Admin hours on later seeds", () => {
    updateMockExamSettings({
      workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startHour: 12,
        endHour: 13,
        active: true,
      })),
    });
    ensureMockExamsSeeded();
    expect(readMockExamsDb().settings.workingHours[1]?.startHour).toBe(12);
  });

  it("exposes only ELP-MOCK on the public catalog and checkout SKU", () => {
    ensurePaymentsSeeded();
    ensureCustomerJourneyProducts();
    const publicCatalog = getPublicElpCatalog();
    expect(publicCatalog.examTypes.every((t) => t.code === "ELP-MOCK")).toBe(true);
    expect(readPaymentsDb().products.some((p) => p.metadata?.sku === "ELP-MOCK")).toBe(true);
    expect(ELP_PAGE.intro).toMatch(/rush fee/i);
    expect(ONLINE_COURSE_PROGRAMMES.find((p) => p.id === "elp")?.points.join(" ")).toMatch(
      /17:00–20:00/,
    );
  });
});
