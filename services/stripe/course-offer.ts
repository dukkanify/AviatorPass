/**
 * Resolve a purchasable offer from AviatorPass course + catalog data.
 * Stripe never owns title, price, or currency.
 */

import { publicCourseRef } from "@/lib/courses/public-course-path";
import { PaymentError } from "@/services/payments/access";
import { getProduct, listProducts } from "@/services/payments/catalog-service";
import { getCourseById } from "@/services/courses/course-service";
import { normalizeCheckoutCurrency } from "@/services/stripe/currency";
import type { CatalogProduct, PricingModel } from "@/types/payments";
import type { Course } from "@/types/courses";
import { sanitizeString } from "@/utils/sanitize";

export interface CourseCheckoutOffer {
  courseId: string;
  courseSlug: string;
  title: string;
  description: string;
  imageUrl: string | null;
  instructorId: string;
  amount: number;
  currency: string;
  productId: string | null;
  pricingModel: PricingModel;
  course: Course | null;
  product: CatalogProduct | null;
}

function coursePriceAmount(course: Course | null): number | null {
  if (!course) return null;
  if (typeof course.priceAmount === "number" && Number.isFinite(course.priceAmount)) {
    return Math.round(course.priceAmount);
  }
  const meta = course.metadata?.priceAmount;
  if (typeof meta === "number" && Number.isFinite(meta)) return Math.round(meta);
  if (typeof meta === "string" && meta.trim()) {
    const n = Number(meta);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function courseCurrency(course: Course | null): string | null {
  if (!course) return null;
  const raw =
    course.currency ||
    (typeof course.metadata?.currency === "string" ? course.metadata.currency : "");
  return raw.trim() ? raw.trim().toUpperCase() : null;
}

function findCatalogProduct(courseId: string): CatalogProduct | null {
  const atpl =
    listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === "ATPL-PACKAGE") ?? null;
  return (
    getProduct(courseId) ||
    listProducts().find((p) => p.courseId === courseId && p.active) ||
    listProducts().find((p) => p.courseId === courseId) ||
    (atpl && (atpl.courseId === courseId || atpl.id === courseId) ? atpl : null)
  );
}

export function resolveCourseOffer(input: {
  courseId: string;
  instructorId?: string | null;
  currency?: string | null;
  amount?: number | null;
}): CourseCheckoutOffer {
  const courseId = sanitizeString(input.courseId || "");
  if (!courseId) throw new PaymentError("courseId is required", 422);

  const product = findCatalogProduct(courseId);
  const course =
    getCourseById(courseId) ?? (product?.courseId ? getCourseById(product.courseId) : null);
  const resolvedCourseId = course?.id || product?.courseId || courseId;

  const amountFromInput =
    typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(input.amount)
      : null;
  const amount = amountFromInput ?? coursePriceAmount(course) ?? product?.priceAmount ?? 0;
  if (!amount || amount < 1) {
    throw new PaymentError(
      "This course has no price in AviatorPass. Set price and currency on the course.",
      422,
    );
  }

  const currency = normalizeCheckoutCurrency(
    input.currency || courseCurrency(course) || product?.currency || "",
  );

  const title = (course?.title || product?.name || "AviatorPass course").trim();
  const description = (
    course?.shortDescription ||
    course?.fullDescription ||
    product?.description ||
    title
  ).trim();
  const imageUrl = course?.coverImageUrl || course?.thumbnailUrl || null;
  const instructorId =
    sanitizeString(input.instructorId || "") ||
    product?.instructorId ||
    course?.primaryInstructorId ||
    "";
  const courseSlug = course ? publicCourseRef(course) : resolvedCourseId;

  return {
    courseId: resolvedCourseId,
    courseSlug,
    title,
    description,
    imageUrl,
    instructorId,
    amount,
    currency,
    productId: product?.id ?? null,
    pricingModel: product?.pricingModel ?? "one_time",
    course,
    product,
  };
}
