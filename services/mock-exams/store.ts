/**
 * Mock Exam Booking durable store (.data/aep-mock-exams.json).
 * Uses json-file-store so read-only hosts (Vercel) never 500 Server Components.
 */

import path from "path";

import {
  clearJsonFileCache,
  dataDir,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import type {
  MockExamCertificate,
  MockExamExtraFee,
  MockExamSettings,
  MockExamSession,
  MockExamType,
} from "@/types/mock-exams";

export interface MockExamsDatabase {
  settings: MockExamSettings;
  examTypes: MockExamType[];
  extraFees: MockExamExtraFee[];
  sessions: MockExamSession[];
  certificates: MockExamCertificate[];
  seeded: boolean;
}

function dataFile() {
  return path.join(dataDir(), "aep-mock-exams.json");
}

export function defaultMockExamSettings(): MockExamSettings {
  const now = new Date().toISOString();
  return {
    enabled: true,
    currency: "KWD",
    timezone: "Asia/Kuwait",
    pricingMode: "dynamic",
    peakStartHour: 16,
    peakEndHour: 21,
    slotStepMinutes: 60,
    bufferMinutes: 15,
    maxAdvanceDays: 30,
    minNoticeMinutes: 120,
    autoCreateZoom: true,
    zoomWaitingRoom: true,
    zoomPasscode: true,
    autoIssueCertificate: true,
    examinerIds: [],
    // ELP / mock journey: Mon–Fri 17:00–20:00 · Sat–Sun 09:00–18:00 (0=Sun … 6=Sat).
    workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const isWeekend = weekday === 0 || weekday === 6;
      return {
        weekday,
        startHour: isWeekend ? 9 : 17,
        endHour: isWeekend ? 18 : 20,
        active: true,
      };
    }),
    blackoutDates: [],
    taxRatePercent: 0,
    updatedAt: now,
  };
}

function defaultExamTypes(): MockExamType[] {
  return [
    {
      id: "me_elp",
      code: "ELP-MOCK",
      name: "English Language Proficiency — Mock Exam",
      description:
        "Live English Language Proficiency mock exam. Book Mon–Fri 17:00–20:00 or Sat–Sun 09:00–18:00 (Kuwait time). Rush fees under 24h / 6–12h. Certificate after the examiner approves the session.",
      durationMinutes: 60,
      basePrice: 40_000,
      active: true,
      peakMultiplier: 1,
      offPeakMultiplier: 1,
    },
    {
      id: "me_atpl_full",
      code: "ATPL-FULL",
      name: "ATPL Full Mock Exam",
      description: "Full timed ATPL theory mock under invigilation.",
      durationMinutes: 180,
      basePrice: 75_000, // 75.000 KWD in fils
      active: true,
      peakMultiplier: 1.25,
      offPeakMultiplier: 0.9,
    },
    {
      id: "me_atpl_subject",
      code: "ATPL-SUBJECT",
      name: "ATPL Subject Mock",
      description: "Single-subject ATPL mock exam session.",
      durationMinutes: 90,
      basePrice: 35_000,
      active: true,
      peakMultiplier: 1.2,
      offPeakMultiplier: 0.95,
    },
    {
      id: "me_progress",
      code: "PROGRESS",
      name: "Progress Check Mock",
      description: "Shorter progress-check mock with examiner feedback.",
      durationMinutes: 60,
      basePrice: 25_000,
      active: true,
      peakMultiplier: 1.15,
      offPeakMultiplier: 1,
    },
  ];
}

function defaultExtraFees(): MockExamExtraFee[] {
  return [
    {
      id: "fee_weekend",
      code: "WEEKEND",
      label: "Weekend surcharge",
      amount: 10_000,
      active: true,
      autoApply: false,
    },
    {
      id: "fee_rush_24",
      code: "RUSH_24H",
      label: "Rush booking (< 24h)",
      amount: 15_000,
      active: true,
      autoApply: true,
    },
    {
      id: "fee_rush_12",
      code: "RUSH_12H",
      label: "Urgent booking (6–12h)",
      amount: 25_000,
      active: true,
      autoApply: true,
    },
    {
      id: "fee_rush",
      code: "RUSH",
      label: "Rush booking (< 48h) — legacy",
      amount: 15_000,
      active: false,
      autoApply: false,
    },
    {
      id: "fee_resit",
      code: "RESIT",
      label: "Resit fee",
      amount: 20_000,
      active: true,
      autoApply: false,
    },
    {
      id: "fee_cert_print",
      code: "CERT_PRINT",
      label: "Printed certificate courier",
      amount: 5_000,
      active: true,
      autoApply: false,
    },
  ];
}

function emptyDb(): MockExamsDatabase {
  return {
    settings: defaultMockExamSettings(),
    examTypes: defaultExamTypes(),
    extraFees: defaultExtraFees(),
    sessions: [],
    certificates: [],
    seeded: false,
  };
}

function normalizeDb(raw: Partial<MockExamsDatabase>): MockExamsDatabase {
  return {
    ...emptyDb(),
    ...raw,
    settings: { ...defaultMockExamSettings(), ...(raw.settings ?? {}) },
    examTypes: raw.examTypes?.length ? raw.examTypes : defaultExamTypes(),
    extraFees: raw.extraFees?.length ? raw.extraFees : defaultExtraFees(),
    sessions: (raw.sessions ?? []).map((s) => ({
      ...s,
      documents: Array.isArray(s.documents) ? s.documents : [],
    })),
    certificates: raw.certificates ?? [],
    seeded: Boolean(raw.seeded),
  };
}

export function readMockExamsDb(): MockExamsDatabase {
  const raw = readJsonFile<Partial<MockExamsDatabase>>(dataFile(), emptyDb);
  return normalizeDb(raw);
}

export function writeMockExamsDb(mutator: (db: MockExamsDatabase) => void): MockExamsDatabase {
  const db = readMockExamsDb();
  mutator(db);
  writeJsonFile(dataFile(), db);
  return db;
}

export function resetMockExamsDbCache(): void {
  clearJsonFileCache(dataFile());
}

export function ensureMockExamsSeeded(): void {
  writeMockExamsDb((d) => {
    if (!d.examTypes.length) d.examTypes = defaultExamTypes();
    if (!d.extraFees.length) d.extraFees = defaultExtraFees();
    if (!d.examTypes.some((t) => t.code === "ELP-MOCK")) {
      const elp = defaultExamTypes().find((t) => t.code === "ELP-MOCK");
      if (elp) d.examTypes.unshift(elp);
    }
    for (const fee of defaultExtraFees()) {
      if (!d.extraFees.some((f) => f.code === fee.code)) d.extraFees.push(fee);
    }
    if (!d.settings.workingHours?.length) {
      d.settings.workingHours = defaultMockExamSettings().workingHours;
    }
    if (!d.settings.timezone) d.settings.timezone = defaultMockExamSettings().timezone;
    d.seeded = true;
    d.settings.updatedAt = new Date().toISOString();
  });
}
