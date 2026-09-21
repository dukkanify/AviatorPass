/**
 * Third-party BNPL (Tamara / Taly / Tabby) is not offered to students.
 * Internal AviatorPass installments (4 / 5 / 6) stay available after login.
 * Set ENABLE_THIRD_PARTY_BNPL=true only to exercise the dormant gateways in tests.
 */

export const THIRD_PARTY_BNPL_BRANDS = ["tamara", "taly", "tabby"] as const;

export function isThirdPartyBnplOffered(): boolean {
  const raw = process.env.ENABLE_THIRD_PARTY_BNPL?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return false;
}

export function isThirdPartyBnplBrand(
  brand: string | null | undefined,
): brand is (typeof THIRD_PARTY_BNPL_BRANDS)[number] {
  const value = (brand ?? "").toLowerCase();
  return value === "tamara" || value === "taly" || value === "tabby";
}

export const THIRD_PARTY_BNPL_REJECTED_MESSAGE =
  "Third-party installment providers are not offered. Pay in full with Stripe, or use AviatorPass installments (4, 5, or 6 payments) after you have an account.";
