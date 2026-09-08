/**
 * Taly configuration — env only. Never hardcode merchant keys or webhook secrets.
 * Taly is https://docs.taly.io (not Tabby / تالي).
 */

import { PRODUCTION_SITE_URL, publicAppOrigin } from "@/lib/site-origin";
import { routes } from "@/constants/routes";
import { COUNTRIES } from "@/constants/countries";

export const TALY_WEBHOOK_PATH = "/api/payments/taly/webhook";
export const TALY_WEBHOOK_URL = `${PRODUCTION_SITE_URL}${TALY_WEBHOOK_PATH}`;
export const TALY_CREATE_ORDER_PATH = "/api/payments/taly/create-order";

export const TALY_SANDBOX_BASE_URL = "https://api.dev-taly.io";
export const TALY_PRODUCTION_BASE_URL = "https://api.taly.io";

/** Taly OAuth client default from merchant-login docs (`merchant-api:secret`). */
export const TALY_OAUTH_CLIENT_BASIC = "Basic bWVyY2hhbnQtYXBpOnNlY3JldA==";

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

export function getTalyApiKey(): string | null {
  return process.env.TALY_API_KEY?.trim() || null;
}

export function getTalySecretKey(): string | null {
  return process.env.TALY_SECRET_KEY?.trim() || null;
}

export function getTalyWebhookSecret(): string | null {
  return process.env.TALY_WEBHOOK_SECRET?.trim() || null;
}

export function getTalyBaseUrl(): string {
  const explicit = process.env.TALY_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return isProductionRuntime() ? TALY_PRODUCTION_BASE_URL : TALY_SANDBOX_BASE_URL;
}

export function isTalyConfigured(): boolean {
  return Boolean(getTalyApiKey() && getTalySecretKey());
}

export function talySuccessUrl(orderId: string, origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentSuccess}?session_id=${encodeURIComponent(orderId)}`;
}

export function talyCancelUrl(orderId: string, origin = publicAppOrigin()): string {
  return `${origin}${routes.paymentCancel}?session_id=${encodeURIComponent(orderId)}`;
}

export function talyNotificationUrl(origin = publicAppOrigin()): string {
  return `${origin}${TALY_WEBHOOK_PATH}`;
}

export function talyDialCode(countryCode: string): string {
  const iso = countryCode.toUpperCase();
  const match = COUNTRIES.find((c) => c.code === iso);
  const dial = match?.dialCode?.replace(/\D/g, "") || "";
  return dial || "965";
}

export function talyNationalPhone(phone: string, countryCode: string): string {
  const digits = phone.replace(/\D/g, "");
  const dial = talyDialCode(countryCode);
  if (dial && digits.startsWith(dial)) {
    return digits.slice(dial.length).replace(/^0+/, "") || digits;
  }
  if (digits.startsWith("00") && dial && digits.startsWith(`00${dial}`)) {
    return digits.slice(2 + dial.length).replace(/^0+/, "") || digits;
  }
  return digits.replace(/^0+/, "") || digits;
}
