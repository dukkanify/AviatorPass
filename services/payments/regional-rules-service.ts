/**
 * Regional payment rules — automatic gateway routing by billing country.
 *
 * United Arab Emirates → Stripe + Tamara
 * Saudi Arabia        → Stripe + Tamara
 * Kuwait              → Stripe + Taly
 * All other countries → Stripe only
 */

import { generateId } from "@/lib/security/crypto";
import { PaymentError } from "@/services/payments/access";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import type {
  BnplProvider,
  CheckoutPaymentMode,
  PaymentMethodBrand,
  RegionalPaymentRule,
} from "@/types/payments";

function nowIso() {
  return new Date().toISOString();
}

export type RoutedGateway = "stripe" | "tamara" | "taly";

/** Country → hosted BNPL gateway. Stripe is always included separately. */
export const COUNTRY_BNPL_ROUTING: Record<string, BnplProvider[]> = {
  AE: ["tamara"],
  SA: ["tamara"],
  KW: ["taly"],
};

export const STRIPE_PAYMENT_BRANDS: readonly PaymentMethodBrand[] = [
  "card",
  "visa",
  "mastercard",
  "amex",
  "apple_pay",
  "google_pay",
  "mada",
  "uae_local",
];

export function routedBnplProviders(countryCode: string | null | undefined): BnplProvider[] {
  const code = (countryCode || "").toUpperCase();
  return COUNTRY_BNPL_ROUTING[code] ? [...COUNTRY_BNPL_ROUTING[code]!] : [];
}

export function allowedGatewaysForCountry(countryCode: string | null | undefined): RoutedGateway[] {
  const gateways: RoutedGateway[] = ["stripe"];
  for (const provider of routedBnplProviders(countryCode)) {
    if (provider === "tamara" || provider === "taly") {
      gateways.push(provider);
    }
  }
  return gateways;
}

export function paymentGatewayForBrand(
  methodBrand: PaymentMethodBrand | CheckoutPaymentMode | string | null | undefined,
): RoutedGateway | "tabby" | "myfatoorah" | "manual" | "installments" | "full" {
  const brand = (methodBrand ?? "card").toLowerCase();
  if (brand === "tamara") return "tamara";
  if (brand === "taly") return "taly";
  if (brand === "tabby") return "tabby";
  if (brand === "myfatoorah") return "myfatoorah";
  if (brand === "manual") return "manual";
  if (brand === "installments") return "installments";
  if (brand === "full") return "full";
  return "stripe";
}

export function isPaymentMethodAllowedForCountry(
  methodBrand: PaymentMethodBrand | CheckoutPaymentMode | string | null | undefined,
  countryCode: string | null | undefined,
): boolean {
  const gateway = paymentGatewayForBrand(methodBrand);
  if (gateway === "stripe" || gateway === "full" || gateway === "installments") return true;
  if (gateway === "tamara") return routedBnplProviders(countryCode).includes("tamara");
  if (gateway === "taly") return routedBnplProviders(countryCode).includes("taly");
  return false;
}

export function assertPaymentMethodAllowedForCountry(
  methodBrand: PaymentMethodBrand | CheckoutPaymentMode | string | null | undefined,
  countryCode: string | null | undefined,
  countryName?: string,
): void {
  if (isPaymentMethodAllowedForCountry(methodBrand, countryCode)) return;
  const gateways = allowedGatewaysForCountry(countryCode);
  const name = countryName || countryCode || "this country";
  const label =
    methodBrand === "tamara"
      ? "Tamara"
      : methodBrand === "taly"
        ? "Taly"
        : methodBrand === "tabby"
          ? "Tabby"
          : String(methodBrand ?? "That payment method");
  const available = gateways
    .map((g) => (g === "stripe" ? "Stripe" : g === "tamara" ? "Tamara" : "Taly"))
    .join(", ");
  throw new PaymentError(`${label} is not available in ${name}. Available: ${available}.`, 400);
}

/** Seed defaults from the country gateway routing table. */
export function defaultRegionalPaymentRules(currency: string): RegionalPaymentRule[] {
  const stamp = nowIso();
  const base = (
    countryCode: string,
    countryName: string,
    bnplProviders: BnplProvider[],
    opts?: Partial<RegionalPaymentRule>,
  ): RegionalPaymentRule => ({
    id: generateId(),
    countryCode,
    countryName,
    currency: opts?.currency ?? currency,
    allowFullPayment: true,
    allowInstallments: opts?.allowInstallments ?? true,
    bnplProviders,
    maxInstallments: opts?.maxInstallments ?? 4,
    minAmount: opts?.minAmount ?? 0,
    requiresPassport: opts?.requiresPassport ?? true,
    requiresAgreement: opts?.requiresAgreement ?? true,
    active: true,
    notes: opts?.notes ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return [
    base("KW", "Kuwait", ["taly"], {
      currency: "KWD",
      maxInstallments: 6,
      notes: "Stripe + Taly. Tamara is hidden.",
    }),
    base("SA", "Saudi Arabia", ["tamara"], {
      currency: "SAR",
      maxInstallments: 6,
      notes: "Stripe + Tamara. Taly is hidden.",
    }),
    base("AE", "United Arab Emirates", ["tamara"], {
      currency: "AED",
      maxInstallments: 6,
      notes: "Stripe + Tamara. Taly is hidden.",
    }),
    base("BH", "Bahrain", [], {
      currency: "BHD",
      maxInstallments: 6,
      notes: "Stripe only.",
    }),
    base("QA", "Qatar", [], {
      currency: "QAR",
      allowInstallments: true,
      maxInstallments: 6,
      notes: "Stripe only.",
    }),
    base("OM", "Oman", [], {
      currency: "OMR",
      allowInstallments: true,
      maxInstallments: 6,
      requiresPassport: true,
      notes: "Stripe only.",
    }),
    base("XX", "Other / International", [], {
      allowInstallments: true,
      maxInstallments: 4,
      requiresPassport: true,
      requiresAgreement: true,
      notes: "Stripe only.",
    }),
  ];
}

function applyCountryGatewayRouting(rule: RegionalPaymentRule): boolean {
  const expected = routedBnplProviders(rule.countryCode);
  const same =
    rule.bnplProviders.length === expected.length &&
    expected.every((provider) => rule.bnplProviders.includes(provider));
  if (same) return false;
  rule.bnplProviders = expected;
  if (rule.countryCode === "KW") {
    rule.maxInstallments = Math.max(rule.maxInstallments, 6);
    rule.notes = "Stripe + Taly. Tamara is hidden.";
  } else if (rule.countryCode === "AE" || rule.countryCode === "SA") {
    rule.maxInstallments = Math.max(rule.maxInstallments, 6);
    rule.notes = "Stripe + Tamara. Taly is hidden.";
  } else {
    rule.notes = "Stripe only.";
  }
  rule.updatedAt = nowIso();
  return true;
}

export function ensureRegionalRulesSeeded(): void {
  writePaymentsDb((db) => {
    if (db.regionalRules.length === 0) {
      db.regionalRules = defaultRegionalPaymentRules(db.settings.currency);
      return;
    }
    for (const rule of db.regionalRules) {
      applyCountryGatewayRouting(rule);
      if (rule.countryCode === "XX" && !rule.allowInstallments) {
        rule.allowInstallments = true;
        rule.maxInstallments = Math.max(rule.maxInstallments, 4);
        rule.requiresPassport = true;
        rule.requiresAgreement = true;
        rule.updatedAt = nowIso();
      }
    }
  });
}

export function listRegionalPaymentRules(activeOnly = false): RegionalPaymentRule[] {
  ensureRegionalRulesSeeded();
  const rows = readPaymentsDb().regionalRules;
  return (activeOnly ? rows.filter((r) => r.active) : rows).sort((a, b) =>
    a.countryName.localeCompare(b.countryName),
  );
}

export function getRegionalPaymentRule(
  countryCode: string | null | undefined,
): RegionalPaymentRule {
  ensureRegionalRulesSeeded();
  const code = (countryCode || "XX").toUpperCase();
  const rows = readPaymentsDb().regionalRules;
  const found =
    rows.find((r) => r.active && r.countryCode === code) ??
    rows.find((r) => r.active && r.countryCode === "XX") ??
    defaultRegionalPaymentRules(readPaymentsDb().settings.currency).find(
      (r) => r.countryCode === "XX",
    )!;
  const expected = routedBnplProviders(
    found.countryCode === "XX" && code !== "XX" ? code : found.countryCode,
  );
  // Unknown countries fall back to the XX rule but must still be Stripe-only.
  if (found.countryCode === "XX") {
    return { ...found, bnplProviders: [] };
  }
  if (
    found.bnplProviders.length !== expected.length ||
    !expected.every((provider) => found.bnplProviders.includes(provider))
  ) {
    return { ...found, bnplProviders: expected };
  }
  return found;
}

export function allowedCheckoutModes(rule: RegionalPaymentRule): CheckoutPaymentMode[] {
  const modes: CheckoutPaymentMode[] = [];
  if (rule.allowFullPayment) modes.push("full");
  if (rule.allowInstallments) modes.push("installments");
  const providers = routedBnplProviders(rule.countryCode);
  if (providers.includes("tamara")) modes.push("tamara");
  if (providers.includes("taly")) modes.push("taly");
  return modes;
}

export function assertCheckoutModeAllowed(
  rule: RegionalPaymentRule,
  mode: CheckoutPaymentMode,
): void {
  const allowed = allowedCheckoutModes(rule);
  if (!allowed.includes(mode)) {
    throw new PaymentError(
      `Payment mode "${mode}" is not available in ${rule.countryName}. Available: ${allowed.join(", ")}`,
      400,
    );
  }
}

export function upsertRegionalPaymentRule(
  input: Partial<RegionalPaymentRule> & { countryCode: string; countryName: string },
): RegionalPaymentRule {
  ensureRegionalRulesSeeded();
  const stamp = nowIso();
  const countryCode = input.countryCode.toUpperCase();
  let saved: RegionalPaymentRule | null = null;
  writePaymentsDb((db) => {
    const idx = db.regionalRules.findIndex((r) => r.countryCode.toUpperCase() === countryCode);
    if (idx >= 0) {
      const current = db.regionalRules[idx]!;
      const next: RegionalPaymentRule = {
        ...current,
        ...input,
        countryCode,
        bnplProviders: routedBnplProviders(countryCode),
        updatedAt: stamp,
      };
      db.regionalRules[idx] = next;
      saved = next;
      return;
    }
    const created: RegionalPaymentRule = {
      id: generateId(),
      countryCode,
      countryName: input.countryName,
      currency: input.currency ?? db.settings.currency,
      allowFullPayment: input.allowFullPayment ?? true,
      allowInstallments: input.allowInstallments ?? false,
      bnplProviders: routedBnplProviders(countryCode),
      maxInstallments: input.maxInstallments ?? 4,
      minAmount: input.minAmount ?? 0,
      requiresPassport: input.requiresPassport ?? false,
      requiresAgreement: input.requiresAgreement ?? false,
      active: input.active ?? true,
      notes: input.notes ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.regionalRules.push(created);
    saved = created;
  });
  return saved!;
}
