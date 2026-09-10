/**
 * Student-facing programme names and action labels.
 * Official short titles stay; commonName is the widely recognised aviation term.
 */

export const PROGRAMME_TERMS = {
  atpl: {
    id: "atpl",
    title: "ATPL Course",
    commonName: "Airline Transport Pilot License",
    short: "ATPL",
  },
  basics: {
    id: "basics",
    title: "Basics of Aviation",
    commonName: "Introduction to aviation",
    short: "Basics",
  },
  ppl: {
    id: "ppl",
    title: "Private Pilot License",
    commonName: "PPL ground school",
    short: "PPL",
  },
  elp: {
    id: "elp",
    title: "ELP Mock Exams",
    titleLive: "ELP Mock Exams Live",
    commonName: "English Language Proficiency",
    short: "ELP",
  },
} as const;

export const ACTION_LABELS = {
  browseCourses: "Browse all courses",
  viewAtplCourse: "View ATPL course",
  contactAdvisor: "Contact an advisor",
  enrolNow: "Enrol now",
  viewCourse: "View course details",
  continueLesson: "Continue lesson",
  enrolInACourse: "Enrol in a course",
  enrolToUnlockLive: "Enrol to unlock live sessions",
} as const;
