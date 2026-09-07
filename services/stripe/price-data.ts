/**
 * Dynamic Stripe Checkout line items from AviatorPass course data.
 * Never uses Stripe Price IDs or Product IDs.
 */

import type Stripe from "stripe";

import { publicAppOrigin } from "@/lib/site-origin";
import type { CourseCheckoutOffer } from "@/services/stripe/course-offer";
import type { StripeCheckoutMode } from "@/services/stripe/types";

function httpsImage(url: string | null, origin: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) return undefined;
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return undefined;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return undefined;
}

export function buildDynamicPriceDataLineItem(
  offer: CourseCheckoutOffer,
  mode: StripeCheckoutMode = "payment",
): Stripe.Checkout.SessionCreateParams.LineItem {
  const origin = publicAppOrigin();
  const image = httpsImage(offer.imageUrl, origin);
  const description = offer.description.slice(0, 500) || undefined;

  return {
    quantity: 1,
    price_data: {
      currency: offer.currency.toLowerCase(),
      unit_amount: offer.amount,
      ...(mode === "subscription" ? { recurring: { interval: "month" as const } } : {}),
      product_data: {
        name: offer.title.slice(0, 250) || "AviatorPass course",
        ...(description ? { description } : {}),
        ...(image ? { images: [image] } : {}),
        metadata: {
          courseId: offer.courseId,
          courseSlug: offer.courseSlug,
          platform: "AviatorPass",
        },
      },
    },
  };
}

export function stripeCheckoutMetadata(input: {
  courseId: string;
  studentId: string;
  instructorId: string;
  courseSlug: string;
  currency: string;
  amount: number;
  extra?: Record<string, string>;
}): Record<string, string> {
  return {
    courseId: input.courseId,
    studentId: input.studentId,
    instructorId: input.instructorId,
    courseSlug: input.courseSlug,
    currency: input.currency,
    amount: String(input.amount),
    platform: "AviatorPass",
    ...(input.extra ?? {}),
  };
}
