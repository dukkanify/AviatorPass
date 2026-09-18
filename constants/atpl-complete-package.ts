/**
 * ATPL Complete Package — client purchase journey (13 subjects + joining terms).
 * CMS may keep extra syllabus rows; this list is what the student reviews before checkout.
 */

export const ATPL_COMPLETE_PACKAGE_NAME = "ATPL Complete Package";

export const ATPL_PACKAGE_MIN_NOTICE_HOURS = 72;
export const ATPL_PACKAGE_MIN_NOTICE_MS = ATPL_PACKAGE_MIN_NOTICE_HOURS * 60 * 60 * 1000;

export const ATPL_PACKAGE_TKI_NOTICE =
  "The requested date and time are provisional and subject to final coordination with the Chief Theoretical Knowledge Instructor (TKI 1).";

export const ATPL_PACKAGE_CONFIRMED_NOTICE =
  "The first lecture time has been confirmed by the Chief Theoretical Knowledge Instructor (TKI 1).";

export const ATPL_PACKAGE_FIRST_LECTURE_TITLE = "ATPL first lecture";
export const ATPL_PACKAGE_FIRST_LECTURE_LESSON_ID = "atpl-first-lecture";

export type AtplPackageScheduleSnapshot = {
  orderId: string | null;
  requestedStudyStartDate: string | null;
  requestedFirstLectureTime: string | null;
  requestedFirstLectureLabel: string | null;
  requestedFirstLectureAt: string | null;
  confirmedStudyStartDate: string | null;
  confirmedFirstLectureTime: string | null;
  confirmedFirstLectureLabel: string | null;
  confirmedFirstLectureAt: string | null;
  scheduleProvisional: boolean;
  scheduleNotice: string;
  scheduleConfirmedAt: string | null;
  firstLectureLiveClassId: string | null;
  firstLectureOnTimetable: boolean;
};

export const EMPTY_ATPL_PACKAGE_SCHEDULE: AtplPackageScheduleSnapshot = {
  orderId: null,
  requestedStudyStartDate: null,
  requestedFirstLectureTime: null,
  requestedFirstLectureLabel: null,
  requestedFirstLectureAt: null,
  confirmedStudyStartDate: null,
  confirmedFirstLectureTime: null,
  confirmedFirstLectureLabel: null,
  confirmedFirstLectureAt: null,
  scheduleProvisional: false,
  scheduleNotice: ATPL_PACKAGE_TKI_NOTICE,
  scheduleConfirmedAt: null,
  firstLectureLiveClassId: null,
  firstLectureOnTimetable: false,
};

export const ATPL_COMPLETE_PACKAGE_SUBJECTS = [
  {
    code: "022",
    title: "Instrumentation",
    shortDescription: "Flight instruments, automatic flight, and cockpit warning systems.",
  },
  {
    code: "061",
    title: "General Navigation",
    shortDescription: "Charts, dead reckoning, and navigation fundamentals.",
  },
  {
    code: "062",
    title: "Radio Navigation",
    shortDescription: "NDB, VOR, ILS, GNSS, and radio-aid procedures.",
  },
  {
    code: "050",
    title: "Meteorology",
    shortDescription: "Atmosphere, weather hazards, charts, and operational forecasting.",
  },
  {
    code: "040",
    title: "Human Performance and Limitations",
    shortDescription: "Physiology, psychology, CRM, and threat-and-error management.",
  },
  {
    code: "021",
    title: "Aircraft General Knowledge",
    shortDescription: "Airframe, electrics, hydraulics, powerplant, and aircraft systems.",
  },
  {
    code: "010",
    title: "Air Law",
    shortDescription: "ICAO framework, licensing, rules of the air, and regulatory operations.",
  },
  {
    code: "033",
    title: "Flight Planning and Monitoring",
    shortDescription: "Fuel, routes, ATC flight plans, and in-flight monitoring.",
  },
  {
    code: "032",
    title: "Performance",
    shortDescription: "Take-off, climb, cruise, landing performance, and limitations.",
  },
  {
    code: "070",
    title: "Operational Procedures",
    shortDescription: "Airline operations, emergencies, and all-weather procedures.",
  },
  {
    code: "081",
    title: "Principles of Flight",
    shortDescription: "Aerodynamics, stability, and high-performance aeroplane theory.",
  },
  {
    code: "031",
    title: "Mass and Balance",
    shortDescription: "Mass definitions, limits, loading, and documentation.",
  },
  {
    code: "090",
    title: "Communications",
    shortDescription: "VFR and IFR phraseology, clearances, procedures, and professional R/T.",
  },
] as const;

export const ATPL_PACKAGE_JOINING_TERMS = [
  "The ATPL Complete Package includes all 13 Airline Transport Pilot License theory subjects listed on this page. Subjects are not sold separately.",
  "Training is live with an instructor. Recordings are not available to students.",
  `After you choose this package you select a study start date and a preferred time for the first lecture. That choice must be at least ${ATPL_PACKAGE_MIN_NOTICE_HOURS} hours from the moment you pay.`,
  ATPL_PACKAGE_TKI_NOTICE,
  "You pay first. Aviator Pass creates your student account after payment succeeds.",
  "Seat confirmation and instructor assignment follow successful payment and coordination with TKI 1.",
] as const;

export const ATPL_PACKAGE_LECTURE_TIME_OPTIONS = [
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
  "21:00",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function formatLocalDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalTimeInput(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export function combineLocalDateAndTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0, 0);
}

export function earliestAtplPackageDateTime(now = new Date()): Date {
  return new Date(now.getTime() + ATPL_PACKAGE_MIN_NOTICE_MS);
}

export function validAtplPackageSchedule(now = new Date()): {
  studyStartDate: string;
  firstLectureTime: string;
} {
  const when = new Date(now);
  when.setDate(when.getDate() + 5);
  when.setHours(18, 0, 0, 0);
  return {
    studyStartDate: formatLocalDateInput(when),
    firstLectureTime: "18:00",
  };
}

export function atplPackageScheduleIssue(
  studyStartDate: string,
  firstLectureTime: string,
  now = new Date(),
): string | null {
  if (!DATE_RE.test(studyStartDate)) return "Choose a study start date.";
  if (!TIME_RE.test(firstLectureTime)) return "Choose a suitable time for the first lecture.";
  const when = combineLocalDateAndTime(studyStartDate, firstLectureTime);
  if (Number.isNaN(when.getTime())) return "Enter a valid date and time.";
  if (when.getTime() < now.getTime() + ATPL_PACKAGE_MIN_NOTICE_MS) {
    return `Choose a start date and first-lecture time at least ${ATPL_PACKAGE_MIN_NOTICE_HOURS} hours from now.`;
  }
  return null;
}

export function formatAtplPackageInstant(value: string | Date): string {
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
}

export function formatAtplPackageScheduleLabel(
  studyStartDate: string,
  firstLectureTime: string,
): string {
  const when = combineLocalDateAndTime(studyStartDate, firstLectureTime);
  if (Number.isNaN(when.getTime())) return `${studyStartDate} · ${firstLectureTime}`;
  return formatAtplPackageInstant(when);
}
