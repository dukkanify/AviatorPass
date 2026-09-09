/**
 * Official ATPL syllabus seed — persisted on first boot, then edited in Super Admin.
 * Not rendered directly by marketing pages.
 */

export const OFFICIAL_ATPL_SUBJECTS: ReadonlyArray<{
  code: string;
  title: string;
  shortDescription: string;
}> = [
  {
    code: "010",
    title: "Air Law",
    shortDescription: "ICAO framework, licensing, rules of the air, and regulatory operations.",
  },
  {
    code: "021",
    title: "Airframe, Systems, Electrics, Power Plant",
    shortDescription: "Airframe, electrics, hydraulics, powerplant, and aircraft systems.",
  },
  {
    code: "022",
    title: "Instrumentation",
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
    title: "Flight Planning & Monitoring",
    shortDescription: "Fuel, routes, ATC flight plans, and in-flight monitoring.",
  },
  {
    code: "034",
    title: "Performance (Second Performance subject as per syllabus)",
    shortDescription: "Second performance paper covering the remaining syllabus module.",
  },
  {
    code: "040",
    title: "Human Performance & Limitations",
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
    code: "082",
    title: "Principles of Flight (Second Principles of Flight subject as per syllabus)",
    shortDescription: "Second principles of flight paper covering the remaining syllabus module.",
  },
  {
    code: "090",
    title: "Communications",
    shortDescription: "VFR and IFR phraseology, clearances, procedures, and professional R/T.",
  },
  {
    code: "",
    title: "Dynamic Management",
    shortDescription:
      "Airline operations management, decision-making, and organisational performance.",
  },
];

export const DEFAULT_ATPL_SUBJECT_BADGE = "Included";
