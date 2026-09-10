/**
 * Featured and recommended course offers for students with no enrolments.
 */

import { routes } from "@/constants/routes";
import { findUserById } from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { getJourneyEnrollMarketing } from "@/lib/marketing/journey-enroll-marketing";
import { emitNotification } from "@/services/notifications/notification-service";
import type { JourneySku } from "@/services/journeys/customer-journey-catalog";

export type CourseOffer = {
  id: string;
  title: string;
  description: string;
  durationLabel: string;
  priceLabel: string;
  imageUrl: string;
  href: string;
  enrollHref: string;
  featured: boolean;
  reason: string;
};

const GCC_COUNTRIES = new Set(["KW", "AE", "QA", "SA", "BH", "OM"]);

const OFFER_DEFS = [
  {
    id: "atpl",
    title: "ATPL Course",
    description:
      "Official ATPL syllabus. Sessions are LIVE. Recordings are not available to students. Purchase first — your account is created automatically.",
    href: routes.atpl,
    sku: "ATPL-PACKAGE" as JourneySku,
    durationLabel: "230 hours",
    imageUrl: "/brand/og.png?v=brand-guide-4",
    featured: true,
    defaultReason: "Featured airline theory pathway",
  },
  {
    id: "basics",
    title: "Basics of Aviation",
    description:
      "A foundation programme for new aviation students — available as a recorded course or live one-to-one with an EASA Certified Instructor.",
    href: routes.onlineCoursesBasics,
    sku: "BASICS-RECORDED" as JourneySku,
    durationLabel: "10 hours",
    imageUrl: "/images/hero-aviation.svg",
    featured: true,
    defaultReason: "Best first step for new students",
  },
  {
    id: "ppl",
    title: "Private Pilot License",
    description:
      "PPL ground school as a recorded programme or live one-to-one training with an EASA Certified Instructor.",
    href: routes.onlineCoursesPpl,
    sku: "PPL-RECORDED" as JourneySku,
    durationLabel: "100 hours",
    imageUrl: "/images/hero-aviation.svg",
    featured: true,
    defaultReason: "Private Pilot ground school",
  },
  {
    id: "elp",
    title: "ELP Mock Exams",
    description:
      "Live English Language Proficiency mock examinations with an instructor — scheduled windows and a certificate after completion.",
    href: routes.onlineCoursesElp,
    sku: "ELP-MOCK" as JourneySku,
    durationLabel: "Live mock exam",
    imageUrl: "/images/hero-aviation.svg",
    featured: true,
    defaultReason: "English proficiency practice",
  },
] as const;

function enrollForSku(sku: JourneySku, fallbackHref: string) {
  if (sku === "ATPL-PACKAGE") {
    const atpl = getAtplProgramMarketing();
    return { enrollHref: atpl.enrollHref, priceLabel: atpl.priceLabel ?? "View pricing" };
  }
  const journey = getJourneyEnrollMarketing(sku);
  return {
    enrollHref: journey.enrollHref || fallbackHref,
    priceLabel: journey.priceLabel ?? "View pricing",
  };
}

function buildOffers(): CourseOffer[] {
  return OFFER_DEFS.map((def) => {
    const pricing = enrollForSku(def.sku, def.href);
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      durationLabel: def.durationLabel,
      priceLabel: pricing.priceLabel,
      imageUrl: def.imageUrl,
      href: def.href,
      enrollHref: pricing.enrollHref,
      featured: def.featured,
      reason: def.defaultReason,
    };
  });
}

function scoreOffer(
  offer: CourseOffer,
  input: {
    countryCode?: string | null;
    activityHints?: string[];
    studentType?: "new" | "returning";
  },
): number {
  let score = offer.featured ? 10 : 0;
  const country = (input.countryCode ?? "").toUpperCase();
  const blob = (input.activityHints ?? []).join(" ").toLowerCase();
  if (GCC_COUNTRIES.has(country) && offer.id === "atpl") score += 8;
  if (!GCC_COUNTRIES.has(country) && offer.id === "basics" && input.studentType !== "returning") {
    score += 6;
  }
  if (input.studentType === "new" && offer.id === "basics") score += 5;
  if (input.studentType === "returning" && offer.id === "atpl") score += 3;
  if (blob.includes(offer.id) || blob.includes(offer.title.toLowerCase())) score += 12;
  if (blob.includes("atpl") && offer.id === "atpl") score += 6;
  if (blob.includes("ppl") && offer.id === "ppl") score += 6;
  if ((blob.includes("elp") || blob.includes("english")) && offer.id === "elp") score += 6;
  return score;
}

export function studentHasActiveEnrolment(userId: string): boolean {
  return listStudentEnrollments(userId).some((row) =>
    ["approved", "completed", "pending"].includes(row.status),
  );
}

export function deriveStudentType(input: {
  profileComplete?: boolean | null;
  createdAt?: string | null;
}): "new" | "returning" {
  if (input.profileComplete === false) return "new";
  const createdAt = input.createdAt ? Date.parse(input.createdAt) : Number.NaN;
  if (!Number.isFinite(createdAt)) return "new";
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - createdAt < fourteenDays ? "new" : "returning";
}

export function listCourseOffers(input: {
  userId: string;
  countryCode?: string | null;
  activityHints?: string[];
  studentType?: "new" | "returning";
}): { featured: CourseOffer[]; recommended: CourseOffer[]; hasEnrollments: boolean } {
  const featured = buildOffers();
  const recommended = [...featured]
    .map((offer) => ({
      offer,
      score: scoreOffer(offer, input),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ offer, score }, index) => ({
      ...offer,
      reason:
        index === 0
          ? GCC_COUNTRIES.has((input.countryCode ?? "").toUpperCase()) && offer.id === "atpl"
            ? "Recommended for your region"
            : offer.reason
          : offer.reason,
      featured: score >= 10,
    }));

  return {
    featured,
    recommended,
    hasEnrollments: studentHasActiveEnrolment(input.userId),
  };
}

export async function ensureCourseOnboardingNotification(userId: string): Promise<void> {
  if (studentHasActiveEnrolment(userId)) return;
  const user = findUserById(userId);
  if (!user || user.role !== "student") return;
  await emitNotification({
    userId,
    type: "course.onboarding",
    title: "Welcome to Aviator Pass!",
    body: "Start by enrolling in your first course.",
    actionUrl: routes.courses,
    dedupeKey: `course.onboarding:${userId}`,
    email: false,
  });
}
