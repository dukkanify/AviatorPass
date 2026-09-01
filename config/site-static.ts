/**
 * Zod-free site constants safe for Client Components.
 * Never import `@/config/env` here — that pulls Zod into the browser bundle and
 * breaks marketing layouts when webpack vendor chunks go stale under HMR.
 */

export const siteStatic = {
  name: "Aviator Pass",
  shortName: "Aviator Pass",
  legalName: "Aviator Pass",
  description:
    "Aviator Pass — a complete aviation education platform. Live and recorded programmes from Basics of Aviation and Private Pilot License through ATPL theory and ELP mock exams, taught by EASA Certified Instructors.",
  tagline: "YOUR AVIATION JOURNEY STARTS HERE",
  secondaryTagline: "COMPLETE AVIATION EDUCATION",
  locale: "en",
  direction: "ltr" as const,
  contactEmail: "info@atplpass.com",
  supportEmail: "support@atplpass.com",
  locations: ["Dubai", "Copenhagen", "Kuwait", "Qatar"] as const,
  socialHandle: "",
  social: {
    instagram: "",
    twitter: "",
    linkedin: "",
    youtube: "",
  },
  brand: {
    /** Official lockups from AVIATOR PASS brand guidelines PDF */
    logo: "/brand/logo.png?v=brand-guide-4",
    logoDark: "/brand/logo-dark.png?v=brand-guide-4",
    logoStacked: "/brand/logo-stacked.png?v=brand-guide-4",
    icon: "/brand/icon.png?v=brand-guide-4",
    /** Light mark for dark chrome (sidebar / collapsed nav) */
    iconLight: "/brand/icon-light.png?v=brand-guide-4",
    favicon: "/brand/favicon.svg?v=brand-guide-4",
    openGraph: "/brand/og.png?v=brand-guide-4",
    appleTouchIcon: "/brand/apple-touch-icon.png?v=brand-guide-4",
    /** Approximate SVG masters — edit/favicon only; UI uses PNGs above */
    logoSvg: "/brand/logo.svg",
    logoDarkSvg: "/brand/logo-dark.svg",
    logoStackedSvg: "/brand/logo-stacked.svg",
    iconSvg: "/brand/icon.svg",
  },
  language: "en" as const,
  englishOnly: true,
} as const;

export type SiteStatic = typeof siteStatic;
