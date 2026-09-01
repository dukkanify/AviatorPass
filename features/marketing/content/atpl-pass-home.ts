/**
 * Aviator Pass — public marketing copy (homepage & shared academy sections).
 * Complete aviation education platform — not ATPL-only.
 */

import { siteStatic } from "@/config/site-static";

export const ATPL_PASS = {
  brand: "Aviator Pass",
  tagline: "YOUR AVIATION JOURNEY STARTS HERE",
  supportEmail: siteStatic.supportEmail,
  contactEmail: siteStatic.contactEmail,
} as const;

export const HERO = {
  kicker: "Complete Aviation Education Platform",
  headline: "Your aviation journey starts here — from first principles to airline theory",
  subheadline:
    "Aviator Pass is a complete aviation education platform. Train with EASA Certified Instructors across Basics of Aviation, Private Pilot License, ATPL theory, and ELP mock exams — live one-to-one and selected recorded programmes.",
  audience: `Serving students in ${siteStatic.locations.join(", ")} and worldwide.`,
  primaryCta: "Explore Online Courses",
  secondaryCta: "View the ATPL Course",
} as const;

export const ABOUT = {
  kicker: "Who We Are",
  title: "A complete aviation education platform",
  whoWeAre:
    "Aviator Pass is a complete aviation education platform — not a single-licence academy. We prepare students from their first introduction to aviation through Private Pilot License ground school, Airline Transport Pilot License theory, and English Language Proficiency mock examinations. Every programme is delivered by EASA Certified Instructors on a modern, secure learning platform.",
  mission:
    "To deliver professional aviation education that builds real competence at every stage of a pilot’s journey — combining live instructor-led training, selected recorded programmes, and a structured digital platform that supports students from first lesson to exam-ready performance.",
  vision:
    "To be the trusted aviation education platform for students across Dubai, Copenhagen, Kuwait, Qatar, and beyond — recognised for EASA Certified Instructors, complete programme coverage, and graduates who meet international professional standards.",
  history:
    "Aviator Pass was built because aviation students needed more than a single ATPL video library. We assembled a full academy: recorded and live pathways for Basics of Aviation and Private Pilot License, a live ATPL theory programme covering 13 theory subjects, and live ELP mock exams — all taught to airline-grade standards with EASA Certified Instructors.",
  values: [
    {
      title: "Safety & Standards",
      body: "Every lesson aligns with ICAO frameworks and regulatory best practice.",
    },
    {
      title: "EASA Certified Instructors",
      body: "Instruction from EASA Certified Instructors — one of our strongest commitments to quality.",
    },
    {
      title: "Complete Pathways",
      body: "Basics, PPL, ATPL, and ELP — live and recorded options that match how you learn.",
    },
    {
      title: "Professional Integrity",
      body: "Transparent training paths, honest feedback, and dedicated academy support.",
    },
  ],
  whyChoose: [
    "EASA Certified Instructors across every programme",
    "Complete aviation pathways — Basics, PPL, ATPL, and ELP",
    "Live one-to-one sessions and selected recorded courses",
    "Structured learning paths with assignments and performance reviews",
    "Mock examinations and practice assessments built into the programmes",
    "Dedicated academy support for students and instructors",
  ],
} as const;

export const WHY_CHOOSE = {
  kicker: "Why Choose Aviator Pass",
  title: "Training engineered for aviation careers",
  features: [
    {
      title: "EASA Certified Instructors",
      body: "Learn from EASA Certified Instructors with professional aviation backgrounds and proven teaching experience — our strongest academic differentiator.",
    },
    {
      title: "Complete Education Platform",
      body: "Basics of Aviation, Private Pilot License, ATPL theory, and ELP mock exams — one academy, every stage of the journey.",
    },
    {
      title: "Live and recorded pathways",
      body: "Live one-to-one instruction where it matters, with selected recorded programmes for flexible self-paced study.",
    },
    {
      title: "Modern Learning Platform",
      body: "A secure digital environment for schedules, materials, assignments, and performance tracking.",
    },
    {
      title: "Structured Training",
      body: "Competency-based modules sequenced for logical progression across each programme.",
    },
    {
      title: "Industry Standards",
      body: "Curriculum aligned with international theory requirements and examination standards.",
    },
    {
      title: "Student Progress Tracking",
      body: "Dashboard visibility into completion, quiz performance, and instructor feedback at every stage.",
    },
    {
      title: "Certificates & Credentials",
      body: "Earn verifiable certificates as you complete modules and demonstrate competency.",
    },
    {
      title: "Zoom Live Sessions",
      body: "Scheduled live classes via Zoom with attendance tracking. ATPL recordings are not released to students.",
    },
    {
      title: "Premium Student Support",
      body: "Dedicated academy support for enrollment, scheduling, and platform assistance.",
    },
  ],
} as const;

export const PLATFORM_FEATURES = {
  kicker: "Platform Features",
  title: "Tools built for aviation education",
  items: [
    {
      title: "Live Classes",
      body: "Scheduled instructor-led sessions with interactive participation.",
    },
    {
      title: "Student Dashboard",
      body: "Schedules, progress, and academy notices in one place.",
    },
    { title: "Progress Tracking", body: "Visual milestones across every enrolled programme." },
    { title: "Certificates", body: "Verifiable credentials upon module and program completion." },
    { title: "Instructor Feedback", body: "Clear guidance on assignments and performance." },
    {
      title: "Performance Reports",
      body: "Detailed analytics on quiz scores and competency trends.",
    },
    {
      title: "Learning Resources",
      body: "Course materials, session notes, and reference documents.",
    },
    {
      title: "Secure Platform",
      body: "Protected accounts, controlled access, and audited academy operations.",
    },
    {
      title: "Modern Learning Experience",
      body: "Responsive design optimised for desktop, tablet, and mobile.",
    },
  ],
} as const;

export const PROGRAM = {
  kicker: "Online Courses",
  title: "One platform. Every aviation pathway.",
  description:
    "Explore Online Courses to choose the programme that matches your stage: Basics of Aviation, Private Pilot License, the live ATPL Course, and ELP Mock Exams Live. Enrol in the ATPL Course for 13 theory subjects in one purchase.",
  includes: [
    "EASA Certified Instructors on every programme",
    "ATPL Course — 13 theory subjects, live instruction",
    "Basics of Aviation — recorded and live one-to-one",
    "Private Pilot License — recorded and live one-to-one",
    "ELP Mock Exams Live",
    "Progress tracking and competency milestones",
    "Assignments and performance reviews",
    "Practice and mock examinations",
    "Digital certificates upon completion",
    "Academy support from first enquiry to exam day",
  ],
  badges: [
    "EASA Certified Instructors",
    "Live Training",
    "Recorded Pathways",
    "Complete Platform",
    "Premium Experience",
  ],
} as const;

export const LEARNING_METHOD = {
  kicker: "How you learn",
  title: "Live where it matters. Recorded where it helps.",
  body: "Aviator Pass is a complete education platform. Selected programmes — Basics of Aviation and Private Pilot License — are offered as recorded courses and as live one-to-one training. The ATPL Course is delivered live: sessions are live, recordings are not available to students, and any internal recording is for quality assurance only.",
  points: [
    "EASA Certified Instructors across live and recorded pathways",
    "Basics and PPL available as recorded or live one-to-one",
    "ATPL Course sessions are live — no student recordings",
    "ELP Mock Exams delivered live with an instructor",
  ],
} as const;

export const INSTRUCTORS = {
  kicker: "Our Instructors",
  title: "EASA Certified Instructors",
  intro:
    "EASA Certified Instructors are one of Aviator Pass’s strongest selling points. Our instructor corps brings professional aviation experience, regulatory knowledge, and a commitment to live, personalised training — selected for industry credentials and the ability to guide students from first principles through ATPL theory with clarity and precision.",
  highlights: [
    {
      title: "EASA Certified Instructors",
      body: "Every Aviator Pass instructor is EASA certified — the academic standard we put at the centre of the academy.",
    },
    {
      title: "Industry Experience",
      body: "Professional backgrounds in commercial aviation and licence instruction.",
    },
    {
      title: "Aviation Credentials",
      body: "Certified instructors with proven examination track records.",
    },
    {
      title: "Personal Guidance",
      body: "One-to-one feedback on assignments and performance reviews.",
    },
    {
      title: "Live Interaction",
      body: "Real-time teaching via Zoom with full student participation.",
    },
    {
      title: "Progress Monitoring",
      body: "Continuous oversight of student competency and milestone completion.",
    },
    { title: "Student Support", body: "Accessible, responsive, and committed to your success." },
    {
      title: "Premium Training Standards",
      body: "Instruction that mirrors airline training department rigour.",
    },
  ],
} as const;

export const PAYMENTS = {
  kicker: "Flexible Payment",
  title: "Professional installment options",
  intro:
    "Invest in your aviation career with flexible payment methods designed for regional convenience. Full payment and installment plans are available at checkout.",
  regions: [
    {
      country: "Kuwait",
      methods: [
        {
          name: "Tally",
          description: "Flexible installments through Tally for Kuwait-based students.",
        },
      ],
    },
    {
      country: "Dubai",
      methods: [
        {
          name: "Tabby",
          description: "Split your program investment into manageable installments.",
        },
        {
          name: "Tamara",
          description: "Buy now, pay later with transparent installment scheduling.",
        },
      ],
    },
    {
      country: "Qatar",
      methods: [
        {
          name: "Cards & wallets",
          description:
            "Secure Stripe checkout in your local currency, including cards and wallets.",
        },
      ],
    },
    {
      country: "Copenhagen",
      methods: [
        {
          name: "Cards & wallets",
          description: "European checkout with cards, Apple Pay, and Google Pay where available.",
        },
      ],
    },
  ],
  note: "Installment availability is subject to provider approval at checkout. All prices are displayed in your selected currency.",
} as const;

export const CONTACT = {
  kicker: "Support",
  title: "Support",
  body: "For enrolment inquiries, scheduling assistance, and platform support, reach the Aviator Pass team directly.",
  cta: "Email Support",
} as const;

export const FINAL_CTA = {
  kicker: "Next step",
  title: "Train with EASA Certified Instructors on a complete aviation platform",
  body: "Join Aviator Pass for Online Courses spanning Basics, PPL, ATPL, and ELP — organised in one academy platform.",
  primaryCta: "Explore Online Courses",
  secondaryCta: "Log in",
} as const;
