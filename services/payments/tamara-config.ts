/**
 * Tamara BNPL configuration — env only. Never hardcode API or notification tokens.
 */

import { PRODUCTION_SITE_URL, publicAppOrigin } from "@/lib/site-origin";
import { routes } from "@/constants/routes";

export const TAMARA_WEBHOOK_PATH = "/api/payments/tamara/webhook";
export const TAMARA_WEBHOOK_URL = `${PRODUCTION_SITE_URL}${TAMARA_WEBHOOK_PATH}`;

export const TAMARA_SANDBOX_BASE_URL = "https://api-sandbox.tamara.co";
export const TAMARA_PRODUCTION_BASE_URL = "https://api.tamara.co";

export const TAMARA_COUNTRY_CODES = ["SA", "AE"] as const;
export type TamaraCountryCode = (typeof TAMARA_COUNTRY_CODES)[number];

export const TAMARA_CURRENCIES = ["SAR", "AED"] as const;

const CITY_BY_COUNTRY: Record<TamaraCountryCode, string> = {
  SA: "Riyadh",
  AE: "Dubai",
};

const DIAL_BY_COUNTRY: Record<TamaraCountryCode, string> = {
  SA: "966",
  AE: "971",
};

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

export function getTamaraApiToken(): string | null {
  return process.env.TAMARA_API_TOKEN?.trim() || null;
}

export function getTamaraNotificationToken(): string | null {
  return process.env.TAMARA_NOTIFICATION_TOKEN?.trim() || null;
}

export function getTamaraBaseUrl(): string {
  const explicit = process.env.TAMARA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return isProductionRuntime() ? TAMARA_PRODUCTION_BASE_URL : TAMARA_SANDBOX_BASE_URL;
}

export function isTamaraConfigured(): boolean {
  return Boolean(getTamaraApiToken());
}

export function isTamaraCountry(countryCode: string | null | undefined): boolean {
  return TAMARA_COUNTRY_CODES.includes((countryCode ?? "").toUpperCase() as TamaraCountryCode);
}

export function tamaraCity(countryCode: string): string {
  const code = countryCode.toUpperCase() as TamaraCountryCode;
  return CITY_BY_COUNTRY[code] ?? "Riyadh";
}

export function tamaraNationalPhone(phone: string, countryCode: string): string {
  const digits = phone.replace(/\D/g, "");
  const code = countryCode.toUpperCase() as TamaraCountryCode;
  const dial = DIAL_BY_COUNTRY[code];
  if (dial && digits.startsWith(dial)) {
    return digits.slice(dial.length).replace(/^0+/, "") || digits;
  }
  if (digits.startsWith("00") && dial && digits.startsWith(`00${dial}`)) {
    return digits.slice(2 + dial.length).replace(/^0+/, "") || digits;
  }
  return digits.replace(/^0+/, "") || digits;
}

export function tamaraSuccessUrl(orderId: string, origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentSuccess}?session_id=${encodeURIComponent(orderId)}`;
}

export function tamaraCancelUrl(orderId: string, origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentCancel}?session_id=${encodeURIComponent(orderId)}`;
}

export function tamaraFailureUrl(orderId: string, origin = publicAppOrigin()): string {
  return tamaraCancelUrl(orderId, origin);
}

export function tamaraNotificationUrl(origin = publicAppOrigin()): string {
  return `${origin}${TAMARA_WEBHOOK_PATH}`;
}
