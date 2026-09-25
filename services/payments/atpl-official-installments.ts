/**
 * Official ATPL international installment plan (non-KW / AE / SA).
 * 2,000 EUR down + four monthly 1,000 EUR payments. School name + passport required.
 */

import { majorToMinor } from "@/services/payments/money";

export const ATPL_LOCAL_INSTALLMENT_COUNTRIES = new Set(["KW", "AE", "SA"]);

export const ATPL_OFFICIAL_EUR_DOWN_PAYMENT_MAJOR = 2000;
export const ATPL_OFFICIAL_EUR_FOLLOW_ON_MAJOR = 1000;
export const ATPL_OFFICIAL_EUR_FOLLOW_ON_COUNT = 4;
export const ATPL_OFFICIAL_EUR_INSTALLMENT_COUNT = 1 + ATPL_OFFICIAL_EUR_FOLLOW_ON_COUNT;
export const ATPL_OFFICIAL_EUR_TOTAL_MAJOR =
  ATPL_OFFICIAL_EUR_DOWN_PAYMENT_MAJOR +
  ATPL_OFFICIAL_EUR_FOLLOW_ON_MAJOR * ATPL_OFFICIAL_EUR_FOLLOW_ON_COUNT;

export function isAtplPackageSku(sku: unknown): boolean {
  return sku === "ATPL-PACKAGE";
}

export function usesOfficialAtplEurInstallments(
  countryCode: string | null | undefined,
  sku?: unknown,
): boolean {
  if (sku != null && !isAtplPackageSku(sku)) return false;
  const country = (countryCode || "").toUpperCase();
  if (!country) return true;
  return !ATPL_LOCAL_INSTALLMENT_COUNTRIES.has(country);
}

export function officialAtplEurInstallmentAmounts(): number[] {
  const down = majorToMinor(ATPL_OFFICIAL_EUR_DOWN_PAYMENT_MAJOR, "EUR");
  const follow = majorToMinor(ATPL_OFFICIAL_EUR_FOLLOW_ON_MAJOR, "EUR");
  return [down, ...Array.from({ length: ATPL_OFFICIAL_EUR_FOLLOW_ON_COUNT }, () => follow)];
}

export function officialAtplEurTotalMinor(): number {
  return officialAtplEurInstallmentAmounts().reduce((sum, amount) => sum + amount, 0);
}

export function normalizeSchoolName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}
