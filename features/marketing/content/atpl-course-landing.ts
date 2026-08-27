/**
 * ATPL Course landing copy — conversion page between Home and Checkout.
 * Purchase-first: Enrol CTAs on this page go to Stripe Checkout, never /register.
 */

export const ATPL_LANDING_HERO = {
  kicker: "ATPL PASS · Live airline theory",
  headline: "The ATPL course built for pilots who train like professionals",
  subheadline:
    "One enrolment. Fourteen ATPL theory subjects. Live instructors. A structured path from first lesson to exam-ready competence — without creating an account before you pay.",
  proof: [
    "Pay first — account created automatically",
    "Live instruction only — no recorded libraries",
    "Worldwide checkout in your local currency",
  ],
  primaryCta: "Enrol in ATPL PASS",
  secondaryCta: "See the 14 subjects",
} as const;

export const COURSE_OVERVIEW = {
  kicker: "Course overview",
  title: "Complete ATPL theory in one professional programme",
  body: "ATPL PASS is a single Airline Transport Pilot License theory programme. You enrol once, receive every subject module, and train live with certified instructors. Progression is competency-based: you move forward when you demonstrate mastery, not when a calendar says so.",
  stats: [
    { value: "14", label: "ATPL subjects" },
    { value: "100%", label: "Live instruction" },
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
      title: "Gulf and international students",
      body: "You train from Kuwait, the UAE, or anywhere Stripe supports — currency is selected automatically at checkout.",
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

/** EASA ATPL theory set used on the conversion page (always 14). */
export const ATPL_SUBJECTS_14 = [
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
    code: "091",
    title: "VFR Communications",
    shortDescription: "VFR phraseology, procedures, and radio discipline.",
  },
  {
    code: "092",
    title: "IFR Communications",
    shortDescription: "IFR phraseology, clearances, and professional R/T.",
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

export const COURSE_BENEFITS = {
  kicker: "Course benefits",
  title: "Why candidates enrol in ATPL PASS",
  items: [
    {
      title: "One purchase, full access",
      body: "Every ATPL subject is included. No subject-by-subject checkout.",
    },
    {
      title: "Account after payment",
      body: "Pay first. AviatorPass creates your student profile automatically and emails a password setup link.",
    },
    {
      title: "Live, never passive",
      body: "Certified instructors teach in real time. Questions are answered in the session, not in a forum days later.",
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
      body: "Enrolment, scheduling, and platform help from the ATPL PASS team.",
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
      role: "Cadet · London",
    },
    {
      quote:
        "Professional from checkout to first class. Currency was correct for my country and the platform felt like an airline training department.",
      name: "Noor S.",
      role: "ATPL candidate · Riyadh",
    },
  ],
} as const;

export const ATPL_FAQS = [
  {
    q: "Do I need an account before I pay?",
    a: "No. Enrol in ATPL PASS opens Stripe Checkout immediately. After a successful payment we create your student account automatically and email a password setup link.",
  },
  {
    q: "What happens after payment?",
    a: "You land on a welcome page. Your course is activated, an invoice is available, and you can continue to the student dashboard once you set your password.",
  },
  {
    q: "Which currency will I be charged in?",
    a: "Stripe selects the Price for your country (for example USD, GBP, EUR, AED, SAR, KWD). We never convert rates inside the app.",
  },
  {
    q: "Are all 14 ATPL subjects included?",
    a: "Yes. One ATPL PASS enrolment covers the full theory set listed on this page. There are no separate subject checkouts.",
  },
  {
    q: "Is training live or recorded?",
    a: "Training is live and instructor-led. There is no self-paced video library. Sessions are interactive with real-time questions and feedback.",
  },
  {
    q: "Can I use Apple Pay or Google Pay?",
    a: "Yes, when Stripe makes them available for your country and device. Cards, Link, and local methods also appear automatically at Checkout.",
  },
  {
    q: "I already have an AviatorPass account.",
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
  name: "ATPL PASS",
  blurb:
    "Full ATPL theory programme with live instructors, all fourteen subjects, mock exams, and platform access. You pay first; registration is automatic.",
  bullets: [
    "All 14 ATPL theory subjects",
    "Live instructor-led sessions",
    "Student dashboard, progress, and certificates",
    "Invoice issued after payment",
    "Account created automatically — no pre-registration",
  ],
  note: "Displayed from is the catalogue amount. Stripe Checkout charges the Price for your detected currency. Apple Pay, Google Pay, and local methods appear when eligible.",
  cta: "Enrol in ATPL PASS",
} as const;
