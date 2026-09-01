import { routes } from "@/constants/routes";

export const ONLINE_COURSES_HUB = {
  kicker: "Online Courses",
  title: "Choose the pathway that matches your aviation stage",
  intro:
    "Aviator Pass is a complete aviation education platform. Explore live and recorded programmes taught by EASA Certified Instructors — from first principles through airline theory.",
  locationsLabel: "Dubai · Copenhagen · Kuwait · Qatar",
} as const;

export const ONLINE_COURSE_PROGRAMMES = [
  {
    id: "atpl",
    title: "ATPL Course",
    href: routes.atpl,
    enrollLabel: "View ATPL Course",
    modes: [{ label: "Live", href: routes.atpl }],
    summary:
      "13 Theory Subjects. Sessions are LIVE. Recordings are not available to students. Purchase first — your account is created automatically.",
    points: [
      "13 ATPL Subjects in one enrolment",
      "EASA Certified Instructors",
      "Live sessions only — no student recordings",
      "Internal recording, if any, is for quality assurance",
    ],
  },
  {
    id: "basics",
    title: "Basics of Aviation",
    href: routes.onlineCoursesBasics,
    enrollLabel: "Explore Basics of Aviation",
    modes: [
      { label: "Recorded", href: `${routes.onlineCoursesBasics}?mode=recorded` },
      { label: "Live One-to-One", href: `${routes.onlineCoursesBasics}?mode=live` },
    ],
    summary:
      "A foundation programme for new aviation students — available as a recorded course or live one-to-one with an EASA Certified Instructor.",
    points: [
      "Recorded self-paced lane",
      "Live One-to-One lane",
      "EASA Certified Instructors",
      "Certificate on successful completion",
    ],
  },
  {
    id: "elp",
    title: "ELP Mock Exams Live",
    href: routes.onlineCoursesElp,
    enrollLabel: "Explore ELP Mock Exams",
    modes: [{ label: "Live", href: routes.onlineCoursesElp }],
    summary:
      "Live English Language Proficiency mock examinations with an instructor — scheduled windows and a certificate after completion.",
    points: [
      "Live mock examination",
      "EASA Certified Instructors",
      "Weekday and weekend windows",
      "Certificate after completion",
    ],
  },
  {
    id: "ppl",
    title: "Private Pilot License",
    href: routes.onlineCoursesPpl,
    enrollLabel: "Explore Private Pilot License",
    modes: [
      { label: "Recorded", href: `${routes.onlineCoursesPpl}?mode=recorded` },
      { label: "Live One-to-One", href: `${routes.onlineCoursesPpl}?mode=live` },
    ],
    summary:
      "PPL ground school as a recorded programme or live one-to-one training with an EASA Certified Instructor.",
    points: [
      "Recorded self-paced lane",
      "Live One-to-One lane",
      "EASA Certified Instructors",
      "Sequential modules and assessments",
    ],
  },
] as const;

export const ONLINE_COURSES_FAQ = [
  {
    q: "Which platform will you teach me from?",
    a: "We proudly use the Pilot100 ATPL Question Bank. Through our collaboration with Pilot100, our students also receive an exclusive discount on their subscription.",
  },
  {
    q: "Are ATPL sessions recorded for students?",
    a: "No. ATPL Course sessions are LIVE. Recordings are not available to students. Sessions may only be recorded internally for quality assurance.",
  },
  {
    q: "Who teaches the courses?",
    a: "All programmes are taught by EASA Certified Instructors — one of Aviator Pass’s strongest academic commitments.",
  },
] as const;

export const BASICS_PAGE = {
  kicker: "Online Courses",
  title: "Basics of Aviation",
  intro:
    "Start your aviation education with a foundation programme designed for new students. Choose recorded self-paced study or live one-to-one sessions with an EASA Certified Instructor.",
} as const;

export const PPL_PAGE = {
  kicker: "Online Courses",
  title: "Private Pilot License",
  intro:
    "PPL ground school on Aviator Pass. Train with recorded lessons or live one-to-one instruction from EASA Certified Instructors.",
} as const;

export const ELP_PAGE = {
  kicker: "Online Courses",
  title: "ELP Mock Exams Live",
  intro:
    "Live English Language Proficiency mock examinations with an EASA Certified Instructor. After payment, wait for the assigned instructor to contact you to agree suitable dates and times.",
} as const;
