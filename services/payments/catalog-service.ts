/**
 * Catalog / pricing products + coupon service.
 */

import { generateId } from "@/lib/security/crypto";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import {
  ATPL_PACKAGE_TIERS,
  type AtplPackageSku,
  isAtplPackageSku,
} from "@/constants/atpl-complete-package";
import { logActivity } from "@/services/auth/activity-log";
import { assertCanManageFinance, PaymentError } from "@/services/payments/access";
import {
  ATPL_FIVE_PRICES,
  ATPL_PACKAGE_PRICES,
  ATPL_SINGLE_PRICES,
} from "@/services/payments/country-pricing";
import { majorToMinor, minorToMajor } from "@/services/payments/money";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import type { CatalogProduct, Coupon, CouponType, PricingModel } from "@/types/payments";
import type { UserProfile } from "@/types";

function nowIso() {
  return new Date().toISOString();
}

export function getPaymentSettings() {
  return readPaymentsDb().settings;
}

export function updatePaymentSettings(
  user: UserProfile,
  patch: Partial<ReturnType<typeof getPaymentSettings>>,
) {
  assertCanManageFinance(user);
  writePaymentsDb((db) => {
    db.settings = { ...db.settings, ...patch };
  });
  return getPaymentSettings();
}

export function listProducts(filters?: { activeOnly?: boolean; courseId?: string }) {
  let rows = [...readPaymentsDb().products];
  if (filters?.activeOnly) rows = rows.filter((p) => p.active);
  if (filters?.courseId) rows = rows.filter((p) => p.courseId === filters.courseId);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function getProduct(id: string): CatalogProduct | null {
  return readPaymentsDb().products.find((p) => p.id === id) ?? null;
}

export function upsertProduct(
  user: UserProfile,
  input: {
    id?: string;
    name: string;
    description?: string;
    pricingModel: PricingModel;
    courseId?: string | null;
    instructorId?: string | null;
    priceAmount: number;
    compareAtAmount?: number | null;
    currency?: string;
    pricesByCurrency?: Record<string, number>;
    isFree?: boolean;
    active?: boolean;
  },
): CatalogProduct {
  assertCanManageFinance(user);
  const stamp = nowIso();
  let savedId: string | null = input.id ?? null;

  writePaymentsDb((db) => {
    if (input.id) {
      const existing = db.products.find((p) => p.id === input.id);
      if (!existing) return;
      Object.assign(existing, {
        name: input.name,
        description: input.description ?? existing.description,
        pricingModel: input.pricingModel,
        courseId: input.courseId ?? existing.courseId,
        instructorId: input.instructorId ?? existing.instructorId,
        priceAmount: input.isFree ? 0 : input.priceAmount,
        compareAtAmount: input.compareAtAmount ?? existing.compareAtAmount,
        currency: input.currency ?? existing.currency,
        pricesByCurrency: input.pricesByCurrency ?? existing.pricesByCurrency,
        isFree: Boolean(input.isFree),
        active: input.active ?? existing.active,
        updatedAt: stamp,
      });
      savedId = existing.id;
      return;
    }
    const product: CatalogProduct = {
      id: generateId(),
      name: input.name,
      description: input.description ?? "",
      pricingModel: input.pricingModel,
      courseId: input.courseId ?? null,
      instructorId: input.instructorId ?? null,
      priceAmount: input.isFree ? 0 : input.priceAmount,
      compareAtAmount: input.compareAtAmount ?? null,
      currency: input.currency ?? db.settings.currency,
      pricesByCurrency: input.pricesByCurrency,
      isFree: Boolean(input.isFree),
      active: input.active ?? true,
      metadata: {},
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.products.unshift(product);
    savedId = product.id;
  });

  const saved = savedId ? getProduct(savedId) : null;
  if (!saved) throw new PaymentError("Product not found", 404);
  return saved;
}

export function getAtplPackageProduct(): CatalogProduct | null {
  return getAtplProductBySku("ATPL-PACKAGE");
}

export function getAtplProductBySku(sku: AtplPackageSku): CatalogProduct | null {
  return readPaymentsDb().products.find((product) => product.metadata?.sku === sku) ?? null;
}

const ATPL_PRICE_CODES = ["KWD", "AED", "SAR", "USD", "EUR"] as const;

const ATPL_DEFAULT_PRICES: Record<AtplPackageSku, Record<string, number>> = {
  "ATPL-SINGLE": ATPL_SINGLE_PRICES,
  "ATPL-5": ATPL_FIVE_PRICES,
  "ATPL-PACKAGE": ATPL_PACKAGE_PRICES,
};

export type AtplTierPricesMajor = {
  sku: AtplPackageSku;
  title: string;
  subjectCount: number;
  productId: string | null;
  prices: Record<string, number>;
};

export function atplPackagePricesMajor(product = getAtplPackageProduct()): Record<string, number> {
  return atplProductPricesMajor(product, "ATPL-PACKAGE");
}

function atplProductPricesMajor(
  product: CatalogProduct | null | undefined,
  sku: AtplPackageSku,
): Record<string, number> {
  const defaults = ATPL_DEFAULT_PRICES[sku];
  const next: Record<string, number> = {};
  for (const code of ATPL_PRICE_CODES) {
    const minor = product?.pricesByCurrency?.[code] ?? defaults[code];
    next[code] = typeof minor === "number" ? minorToMajor(minor, code) : 0;
  }
  return next;
}

export function listAtplTierPricesMajor(): AtplTierPricesMajor[] {
  return ATPL_PACKAGE_TIERS.map((tier) => {
    const product = getAtplProductBySku(tier.sku);
    return {
      sku: tier.sku,
      title: tier.title,
      subjectCount: tier.subjectCount,
      productId: product?.id ?? null,
      prices: atplProductPricesMajor(product, tier.sku),
    };
  });
}

function applyMajorPrices(
  existing: CatalogProduct,
  majors: Record<string, number>,
): {
  pricesByCurrency: Record<string, number>;
  priceAmount: number;
  currency: string;
} {
  const pricesByCurrency: Record<string, number> = { ...(existing.pricesByCurrency ?? {}) };
  for (const code of ATPL_PRICE_CODES) {
    if (majors[code] == null) continue;
    const major = Number(majors[code]);
    if (!Number.isFinite(major) || major < 0) {
      throw new PaymentError(`Enter a valid ${code} price`, 400);
    }
    pricesByCurrency[code] = majorToMinor(major, code);
  }
  const currency = existing.currency || "KWD";
  return {
    pricesByCurrency,
    priceAmount: pricesByCurrency[currency] ?? existing.priceAmount,
    currency,
  };
}

export function updateAtplPackagePrices(
  user: UserProfile,
  majors: Record<string, number>,
): CatalogProduct {
  const [full] = updateAtplTierPrices(user, { "ATPL-PACKAGE": majors });
  if (!full) throw new PaymentError("ATPL package product is missing", 404);
  return full;
}

export function updateAtplTierPrices(
  user: UserProfile,
  tiers: Partial<Record<AtplPackageSku, Record<string, number>>>,
): CatalogProduct[] {
  assertCanManageFinance(user);
  const saved: CatalogProduct[] = [];
  for (const [sku, majors] of Object.entries(tiers)) {
    if (!isAtplPackageSku(sku) || !majors) continue;
    const existing = getAtplProductBySku(sku);
    if (!existing) throw new PaymentError(`${sku} product is missing`, 404);
    const next = applyMajorPrices(existing, majors);
    saved.push(
      upsertProduct(user, {
        id: existing.id,
        name: existing.name,
        description: existing.description,
        pricingModel: existing.pricingModel,
        courseId: existing.courseId,
        instructorId: existing.instructorId,
        priceAmount: next.priceAmount,
        compareAtAmount: existing.compareAtAmount,
        currency: next.currency,
        pricesByCurrency: next.pricesByCurrency,
        isFree: existing.isFree,
        active: existing.active,
      }),
    );
  }
  if (saved.length === 0) {
    throw new PaymentError("Provide prices for at least one ATPL package", 400);
  }
  return saved;
}

export function listCoupons() {
  return [...readPaymentsDb().coupons].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCouponByCode(code: string): Coupon | null {
  const normalized = code.trim().toUpperCase();
  return (
    readPaymentsDb().coupons.find((c) => c.code.toUpperCase() === normalized && c.active) ?? null
  );
}

export async function createCoupon(
  user: UserProfile,
  input: {
    code: string;
    type: CouponType;
    value: number;
    courseId?: string | null;
    maxUses?: number | null;
    minPurchaseAmount?: number;
    maxDiscountAmount?: number | null;
    expiresAt?: string | null;
  },
): Promise<Coupon> {
  assertCanManageFinance(user);
  const code = input.code.trim().toUpperCase();
  if (getCouponByCode(code)) throw new PaymentError("Coupon code already exists");

  const stamp = nowIso();
  const coupon: Coupon = {
    id: generateId(),
    code,
    type: input.type,
    value: input.value,
    courseId: input.courseId ?? null,
    maxUses: input.maxUses ?? null,
    usedCount: 0,
    minPurchaseAmount: input.minPurchaseAmount ?? 0,
    maxDiscountAmount: input.maxDiscountAmount ?? null,
    expiresAt: input.expiresAt ?? null,
    active: true,
    createdById: user.id,
    createdAt: stamp,
    updatedAt: stamp,
  };

  writePaymentsDb((db) => {
    db.coupons.unshift(coupon);
  });

  await logActivity({
    actorId: user.id,
    action: ACTIVITY_ACTIONS.COUPON_CREATED,
    entityType: "coupon",
    entityId: coupon.id,
    metadata: { code: coupon.code },
  });

  return coupon;
}

export function validateCoupon(input: {
  code: string;
  userId: string;
  subtotalAmount: number;
  courseId?: string | null;
}): { coupon: Coupon; discountAmount: number } {
  const coupon = getCouponByCode(input.code);
  if (!coupon) throw new PaymentError("Invalid coupon code");
  if (coupon.expiresAt && coupon.expiresAt < nowIso()) {
    throw new PaymentError("Coupon has expired");
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new PaymentError("Coupon usage limit reached");
  }
  if (input.subtotalAmount < coupon.minPurchaseAmount) {
    throw new PaymentError("Order does not meet coupon minimum purchase");
  }
  if (coupon.courseId && input.courseId && coupon.courseId !== input.courseId) {
    throw new PaymentError("Coupon is not valid for this course");
  }

  let discount =
    coupon.type === "percent"
      ? Math.round((input.subtotalAmount * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscountAmount !== null) {
    discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  discount = Math.min(discount, input.subtotalAmount);
  return { coupon, discountAmount: discount };
}
