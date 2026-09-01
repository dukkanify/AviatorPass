/**
 * ATPL Course landing copy — conversion page between Home and Checkout.
 * Purchase-first: Enrol CTAs on this page go to Stripe Checkout, never /register.
 */

export const ATPL_LANDING_HERO = {
  kicker: "Aviator Pass · ATPL Course · Live airline theory",
  headline: "The ATPL course built for pilots who train like professionals",
  subheadline:
    "One enrolment. 13 ATPL Subjects. Live instructors. A structured path from first lesson to exam-ready competence — without creating an account before you pay.",
  proof: [
    "Pay first — account created automatically",
    "Sessions are LIVE — recordings are not available to students",
    "Worldwide checkout in your local currency",
  ],
  primaryCta: "Enrol in Aviator Pass",
  secondaryCta: "See the 13 ATPL Subjects",
} as const;

export const COURSE_OVERVIEW = {
  kicker: "Course overview",
  title: "Complete ATPL theory in one professional programme",
  body: "The Aviator Pass ATPL Course is a single Airline Transport Pilot License theory programme. You enrol once, receive every subject module, and train live with EASA Certified Instructors. Progression is competency-based: you move forward when you demonstrate mastery, not when a calendar says so.",
  stats: [
    { value: "13", label: "ATPL Subjects" },
    { value: "LIVE", label: "Instruction only" },
    { value: "1", label: "Unified enrolment" },
    { value: "Global", label: "Stripe checkout" },
  ],
} as const;

export const WHO_SHOULD_JOIN = {
  kicker: "Who should join",
  title: "Built for serious ATPL candidates",
  intro:
    "If you expect airline-grade standards rather than a video library, this course is designed for you.",
  profiles: [
    {
      title: "ATPL theory candidates",
      body: "You are preparing for regulatory ATPL examinations and need live instruction, mock exams, and a complete subject set.",
    },
    {
      title: "CPL holders stepping up",
      body: "You already fly professionally and need a structured, instructor-led path through ATPL theory without fragmenting purchases.",
    },
    {
      title: "Cadets and career changers",
      body: "You want a premium academy experience with clear milestones, instructor feedback, and a platform that tracks every subject.",
    },
    {
      title: "International students",
      body: "You train from Dubai, Copenhagen, Kuwait, Qatar, or anywhere Stripe supports — currency is selected automatically at checkout.",
    },
  ],
} as const;

export const LEARNING_OUTCOMES = {
  kicker: "Learning outcomes",
  title: "What you will be able to do",
  items: [
    "Apply ICAO-aligned air law and operational procedures to professional scenarios",
    "Calculate mass, balance, and performance with examination-grade accuracy",
    "Plan and monitor flights using meteorology, navigation, and radio aids",
    "Explain aircraft systems, instrumentation, and principles of flight with precision",
    "Demonstrate human performance awareness and professional communications",
    "Sit mock examinations with measurable scores and instructor debriefs",
  ],
} as const;

/** EASA ATPL theory set used on the conversion page (13 Theory Subjects). */
export const ATPL_SUBJECTS_13 = [
  {
    code: "010",
    title: "Air Law",
    shortDescription: "ICAO framework, licensing, rules of the air, and regulatory operations.",
  },
  {
    code: "021",
    title: "AGK — Airframe & Systems",
    shortDescription: "Airframe, electrics, hydraulics, powerplant, and aircraft systems.",
  },
  {
    code: "022",
    title: "AGK — Instrumentation",
    shortDescription: "Flight instruments, automatic flight, and cockpit warning systems.",
  },
  {
    code: "031",
    title: "Mass & Balance",
    shortDescription: "Mass definitions, limits, loading, and documentation.",
  },
  {
    code: "032",
    title: "Performance",
    shortDescription: "Take-off, climb, cruise, landing performance, and limitations.",
  },
  {
    code: "033",
    title: "Flight Planning",
    shortDescription: "Fuel, routes, ATC flight plans, and in-flight monitoring.",
  },
  {
    code: "040",
    title: "Human Performance",
    shortDescription: "Physiology, psychology, CRM, and threat-and-error management.",
  },
  {
    code: "050",
    title: "Meteorology",
    shortDescription: "Atmosphere, weather hazards, charts, and operational forecasting.",
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
    code: "090",
    title: "Communications",
    shortDescription: "VFR and IFR phraseology, clearances, procedures, and professional R/T.",
  },
] as const;

export const COURSE_STRUCTURE = {
  kicker: "Course structure",
  title: "Four phases. One licence path.",
  phases: [
    {
      step: "01",
      title: "Foundation",
      body: "Air law, human performance, and communications — the professional baseline every session builds on.",
    },
    {
      step: "02",
      title: "Aircraft",
      body: "Airframe, systems, instruments, and principles of flight with live worked examples.",
    },
    {
      step: "03",
      title: "Performance & planning",
      body: "Mass & balance, performance, and flight planning until the numbers are second nature.",
    },
    {
      step: "04",
      title: "Operations & exams",
      body: "Meteorology, navigation, procedures, mock examinations, and instructor debriefs.",
    },
  ],
} as const;

export const ATPL_LIVE_TRAINING = {
  kicker: "Live training",
  title: "Sessions are LIVE",
  body: "ATPL Course sessions are delivered live with an EASA Certified Instructor. Recordings are not available to students. Sessions may only be recorded internally for quality assurance.",
  points: [
    "Every ATPL session is conducted live with an instructor",
    "Interactive participation — questions, exercises, and discussions",
    "Recordings are not available to students",
    "Internal recording, if any, is for quality assurance only",
  ],
} as const;

export const COURSE_BENEFITS = {
  kicker: "Course benefits",
  title: "Why candidates enrol in the ATPL Course",
  items: [
    {
      title: "One purchase, full access",
      body: "All 13 ATPL Subjects are included. No subject-by-subject checkout.",
    },
    {
      title: "Account after payment",
      body: "Pay first. Aviator Pass creates your student profile automatically and emails a password setup link.",
    },
    {
      title: "Live, never a student recording library",
      body: "EASA Certified Instructors teach in real time. Recordings are not available to students.",
    },
    {
      title: "Measurable progress",
      body: "Dashboard tracking, assignments, mock exams, and certificates as you demonstrate competency.",
    },
    {
      title: "Global checkout",
      body: "Stripe selects currency from your country. Apple Pay, Google Pay, cards, and local methods appear automatically.",
    },
    {
      title: "Academy support",
      body: "Enrolment, scheduling, and platform help from the Aviator Pass team.",
    },
  ],
} as const;

export const STUDENT_REVIEWS = {
  kicker: "Student reviews",
  title: "What candidates say after they train live",
  items: [
    {
      quote:
        "I expected recorded lectures. Instead every session was live, demanding, and exactly the standard I wanted before ATPL exams.",
      name: "Omar A.",
      role: "ATPL candidate · Kuwait",
    },
    {
      quote:
        "Paying first and receiving the account by email was seamless. I was in the dashboard the same evening with every subject unlocked.",
      name: "Layla R.",
      role: "CPL holder · Dubai",
    },
    {
      quote:
        "The mock exams and instructor debriefs changed how I studied. I finally knew which subjects needed another live pass.",
      name: "James K.",
      role: "Cadet · Copenhagen",
    },
    {
      quote:
        "Professional from checkout to first class. Currency was correct for my country and the platform felt like an airline training department.",
      name: "Noor S.",
      role: "ATPL candidate · Qatar",
    },
  ],
} as const;

export const ATPL_FAQS = [
  {
    q: "Do I need an account before I pay?",
    a: "No. Enrol in Aviator Pass opens Stripe Checkout immediately. After a successful payment we create your student account automatically and email a password setup link.",
  },
  {
    q: "What happens after payment?",
    a: "You land on a welcome page. Your course is activated, an invoice is available, and you can continue to the student dashboard once you set your password. Please wait for the assigned instructor to contact you directly to arrange your schedule.",
  },
  {
    q: "Which currency will I be charged in?",
    a: "Stripe selects the Price for your country (for example USD, GBP, EUR, AED, SAR, KWD). We never convert rates inside the app.",
  },
  {
    q: "Are all 13 ATPL Subjects included?",
    a: "Yes. One ATPL Course enrolment covers the full 13 Theory Subjects listed on this page. There are no separate subject checkouts.",
  },
  {
    q: "Is training live or recorded?",
    a: "ATPL Course sessions are LIVE. Recordings are not available to students. Sessions may only be recorded internally for quality assurance.",
  },
  {
    q: "Which platform will you teach me from?",
    a: "We proudly use the Pilot100 ATPL Question Bank. Through our collaboration with Pilot100, our students also receive an exclusive discount on their subscription.",
  },
  {
    q: "Can I use Apple Pay or Google Pay?",
    a: "Yes, when Stripe makes them available for your country and device. Cards, Link, and local methods also appear automatically at Checkout.",
  },
  {
    q: "I already have an Aviator Pass account.",
    a: "Pay with the same email. We attach the purchase to your existing student profile and activate the course — we do not create a second user.",
  },
  {
    q: "What if payment fails?",
    a: "No account is created and no seat is reserved. You can retry checkout when you are ready.",
  },
] as const;

export const PRICING = {
  kicker: "Pricing",
  title: "One programme. Transparent checkout.",
  name: "ATPL Course",
  blurb:
    "Full ATPL theory programme with EASA Certified Instructors, all 13 Theory Subjects, mock exams, and platform access. You pay first; registration is automatic.",
  bullets: [
    "All 13 ATPL Subjects",
    "Live instructor-led sessions — no student recordings",
    "Student dashboard, progress, and certificates",
    "Invoice issued after payment",
    "Account created automatically — no pre-registration",
  ],
  note: "Displayed from is the catalogue amount. Stripe Checkout charges the Price for your detected currency. Apple Pay, Google Pay, and local methods appear when eligible.",
  cta: "Enrol in Aviator Pass",
} as const;
