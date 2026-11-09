/**
 * Site copy field catalog + defaults sourced from marketing content modules.
 */

import { routes } from "@/constants/routes";
import { ABOUT, HERO } from "@/features/marketing/content/atpl-pass-home";
import {
  ATPL_LANDING_HERO,
  COURSE_OVERVIEW,
} from "@/features/marketing/content/atpl-course-landing";
import {
  BASICS_PAGE,
  ELP_PAGE,
  ONLINE_COURSES_HUB,
  PPL_PAGE,
} from "@/features/marketing/content/online-courses";
import type { SiteCopyPageDef, SiteCopyPageId } from "@/types/site-copy";

/** Flightpath / Live / Contact primary strings (were inline in page.tsx). */
export const FLIGHTPATH_PAGE = {
  kicker: "AviatorPass flightpath",
  title: "Three altitudes",
  subtitle: "One training OS from syllabus to license readiness",
  intro:
    "Learn on structured ATPL lanes, book live Zoom when you need altitude, then prove mastery, without brochure noise.",
} as const;

export const LIVE_PAGE = {
  kicker: "Live altitude",
  title: "Live Zoom",
  subtitle: "Clear the turbulence with a live instructor",
  intro:
    "Private coaching windows in Greenwich Mean Time. Reserve first, confirm by email, then join from your AviatorPass lobby.",
} as const;

export const CONTACT_PAGE = {
  kicker: "YOUR AVIATION JOURNEY STARTS HERE",
  title: "Contact an advisor",
  intro:
    "Tell us where you are in your aviation journey. We will help you choose the ATPL Course, Basics of Aviation, Private Pilot License, or ELP mock exams.",
} as const;

export const SITE_COPY_PAGES: SiteCopyPageDef[] = [
  {
    id: "home",
    label: "Home",
    path: routes.home,
    fields: [
      { key: "hero.kicker", label: "Hero kicker" },
      { key: "hero.headline", label: "Hero headline", multiline: true },
      { key: "hero.subheadline", label: "Hero subheadline", multiline: true },
      { key: "hero.primaryCta", label: "Hero primary CTA" },
      { key: "hero.secondaryCta", label: "Hero secondary CTA" },
      { key: "about.kicker", label: "About kicker" },
      { key: "about.title", label: "About title" },
      { key: "about.whoWeAre", label: "Who We Are", multiline: true },
      { key: "about.mission", label: "Our Mission", multiline: true },
      { key: "about.vision", label: "Our Vision", multiline: true },
      { key: "about.history", label: "Our History", multiline: true },
      { key: "about.values.0.title", label: "Value 1 title" },
      { key: "about.values.0.body", label: "Value 1 body", multiline: true },
      { key: "about.values.1.title", label: "Value 2 title" },
      { key: "about.values.1.body", label: "Value 2 body", multiline: true },
      { key: "about.values.2.title", label: "Value 3 title" },
      { key: "about.values.2.body", label: "Value 3 body", multiline: true },
      { key: "about.values.3.title", label: "Value 4 title" },
      { key: "about.values.3.body", label: "Value 4 body", multiline: true },
      { key: "about.whyChoose.0", label: "Why choose 1", multiline: true },
      { key: "about.whyChoose.1", label: "Why choose 2", multiline: true },
      { key: "about.whyChoose.2", label: "Why choose 3", multiline: true },
      { key: "about.whyChoose.3", label: "Why choose 4", multiline: true },
      { key: "about.whyChoose.4", label: "Why choose 5", multiline: true },
      { key: "about.whyChoose.5", label: "Why choose 6", multiline: true },
      { key: "about.whyChoose.6", label: "Why choose 7", multiline: true },
    ],
  },
  {
    id: "atpl",
    label: "ATPL Course",
    path: routes.atpl,
    fields: [
      { key: "hero.kicker", label: "Hero kicker" },
      { key: "hero.headline", label: "Hero headline", multiline: true },
      { key: "hero.subheadline", label: "Hero subheadline", multiline: true },
      { key: "hero.primaryCta", label: "Hero primary CTA" },
      { key: "hero.secondaryCta", label: "Hero secondary CTA" },
      { key: "overview.title", label: "Overview title", multiline: true },
      { key: "overview.body", label: "Overview body", multiline: true },
    ],
  },
  {
    id: "online-courses",
    label: "Online Courses",
    path: routes.onlineCourses,
    fields: [
      { key: "hub.kicker", label: "Kicker" },
      { key: "hub.title", label: "Title", multiline: true },
      { key: "hub.intro", label: "Intro", multiline: true },
      { key: "hub.locationsLabel", label: "Locations label" },
    ],
  },
  {
    id: "online-courses-basics",
    label: "Basics of Aviation",
    path: routes.onlineCoursesBasics,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
  {
    id: "online-courses-ppl",
    label: "Private Pilot License",
    path: routes.onlineCoursesPpl,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
  {
    id: "online-courses-elp",
    label: "ELP Mock Exams",
    path: routes.onlineCoursesElp,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
  {
    id: "flightpath",
    label: "Flightpath",
    path: routes.flightpath,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "subtitle", label: "Subtitle", multiline: true },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
  {
    id: "live",
    label: "Live Zoom",
    path: routes.live,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "subtitle", label: "Subtitle", multiline: true },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    path: routes.contact,
    fields: [
      { key: "kicker", label: "Kicker" },
      { key: "title", label: "Title" },
      { key: "intro", label: "Intro", multiline: true },
    ],
  },
];

const DEFAULTS: Record<SiteCopyPageId, Record<string, string>> = {
  home: {
    "hero.kicker": HERO.kicker,
    "hero.headline": HERO.headline,
    "hero.subheadline": HERO.subheadline,
    "hero.primaryCta": HERO.primaryCta,
    "hero.secondaryCta": HERO.secondaryCta,
    "about.kicker": ABOUT.kicker,
    "about.title": ABOUT.title,
    "about.whoWeAre": ABOUT.whoWeAre,
    "about.mission": ABOUT.mission,
    "about.vision": ABOUT.vision,
    "about.history": ABOUT.history,
    "about.values.0.title": ABOUT.values[0]!.title,
    "about.values.0.body": ABOUT.values[0]!.body,
    "about.values.1.title": ABOUT.values[1]!.title,
    "about.values.1.body": ABOUT.values[1]!.body,
    "about.values.2.title": ABOUT.values[2]!.title,
    "about.values.2.body": ABOUT.values[2]!.body,
    "about.values.3.title": ABOUT.values[3]!.title,
    "about.values.3.body": ABOUT.values[3]!.body,
    "about.whyChoose.0": ABOUT.whyChoose[0]!,
    "about.whyChoose.1": ABOUT.whyChoose[1]!,
    "about.whyChoose.2": ABOUT.whyChoose[2]!,
    "about.whyChoose.3": ABOUT.whyChoose[3]!,
    "about.whyChoose.4": ABOUT.whyChoose[4]!,
    "about.whyChoose.5": ABOUT.whyChoose[5]!,
    "about.whyChoose.6": ABOUT.whyChoose[6]!,
  },
  atpl: {
    "hero.kicker": ATPL_LANDING_HERO.kicker,
    "hero.headline": ATPL_LANDING_HERO.headline,
    "hero.subheadline": ATPL_LANDING_HERO.subheadline,
    "hero.primaryCta": ATPL_LANDING_HERO.primaryCta,
    "hero.secondaryCta": ATPL_LANDING_HERO.secondaryCta,
    "overview.title": COURSE_OVERVIEW.title,
    "overview.body": COURSE_OVERVIEW.body,
  },
  "online-courses": {
    "hub.kicker": ONLINE_COURSES_HUB.kicker,
    "hub.title": ONLINE_COURSES_HUB.title,
    "hub.intro": ONLINE_COURSES_HUB.intro,
    "hub.locationsLabel": ONLINE_COURSES_HUB.locationsLabel,
  },
  "online-courses-basics": {
    kicker: BASICS_PAGE.kicker,
    title: BASICS_PAGE.title,
    intro: BASICS_PAGE.intro,
  },
  "online-courses-ppl": {
    kicker: PPL_PAGE.kicker,
    title: PPL_PAGE.title,
    intro: PPL_PAGE.intro,
  },
  "online-courses-elp": {
    kicker: ELP_PAGE.kicker,
    title: ELP_PAGE.title,
    intro: ELP_PAGE.intro,
  },
  flightpath: {
    kicker: FLIGHTPATH_PAGE.kicker,
    title: FLIGHTPATH_PAGE.title,
    subtitle: FLIGHTPATH_PAGE.subtitle,
    intro: FLIGHTPATH_PAGE.intro,
  },
  live: {
    kicker: LIVE_PAGE.kicker,
    title: LIVE_PAGE.title,
    subtitle: LIVE_PAGE.subtitle,
    intro: LIVE_PAGE.intro,
  },
  contact: {
    kicker: CONTACT_PAGE.kicker,
    title: CONTACT_PAGE.title,
    intro: CONTACT_PAGE.intro,
  },
};

export function getSiteCopyPageDef(pageId: SiteCopyPageId): SiteCopyPageDef {
  const page = SITE_COPY_PAGES.find((p) => p.id === pageId);
  if (!page) throw new Error(`Unknown site copy page: ${pageId}`);
  return page;
}

export function getSiteCopyDefaults(pageId: SiteCopyPageId): Record<string, string> {
  return { ...DEFAULTS[pageId] };
}

export function isSiteCopyPageId(value: string): value is SiteCopyPageId {
  return SITE_COPY_PAGES.some((p) => p.id === value);
}
