/**
 * Keep the AviatorPass catalog product in sync with the course record.
 * Admins never create Stripe Products or Prices.
 */

import { generateId } from "@/lib/security/crypto";
import { listProducts } from "@/services/payments/catalog-service";
import { writePaymentsDb } from "@/services/payments/store";
import type { CatalogProduct } from "@/types/payments";
import type { Course } from "@/types/courses";

function nowIso() {
  return new Date().toISOString();
}

export function syncCatalogProductForCourse(course: Course): CatalogProduct | null {
  const amount = typeof course.priceAmount === "number" ? Math.round(course.priceAmount) : null;
  const currency = course.currency?.trim().toUpperCase() || null;
  if (amount == null || amount < 0 || !currency) return null;

  const stamp = nowIso();
  let savedId: string | null = null;

  writePaymentsDb((db) => {
    const existing =
      db.products.find((p) => p.courseId === course.id && p.metadata?.source === "course") ||
      db.products.find((p) => p.courseId === course.id && p.active) ||
      db.products.find((p) => p.courseId === course.id);

    if (existing) {
      existing.name = course.title;
      existing.description =
        course.shortDescription || course.fullDescription || existing.description;
      existing.instructorId = course.primaryInstructorId ?? existing.instructorId;
      existing.priceAmount = amount;
      existing.currency = currency;
      existing.isFree = amount === 0;
      existing.active = amount > 0 && course.status === "published" ? true : existing.active;
      existing.updatedAt = stamp;
      existing.metadata = {
        ...existing.metadata,
        source: existing.metadata?.source ?? "course",
        courseSlug: course.code || course.id,
      };
      savedId = existing.id;
      return;
    }

    const product: CatalogProduct = {
      id: generateId(),
      name: course.title,
      description: course.shortDescription || course.fullDescription || course.title,
      pricingModel: "one_time",
      courseId: course.id,
      instructorId: course.primaryInstructorId,
      priceAmount: amount,
      compareAtAmount: null,
      currency,
      isFree: amount === 0,
      active: amount > 0,
      metadata: { source: "course", courseSlug: course.code || course.id },
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.products.unshift(product);
    savedId = product.id;
  });

  return listProducts().find((p) => p.id === savedId) ?? null;
}
