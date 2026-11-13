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

/**
 * Pin Taly-touching serverless routes away from bom1 (blocked by Taly edge/WAF).
 * iad1 was verified to reach api.taly.io / api.dev-taly.io.
 */
export const TALY_PREFERRED_REGIONS = ["iad1"] as const;

/** Documented sandbox OAuth client id from Taly merchant-login docs (not a merchant API key). */
const TALY_DOCS_OAUTH_CLIENT_ID = "merchant-api";
const TALY_DOCS_OAUTH_CLIENT_SECRET = "secret";

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

export function getTalyOauthClientId(): string | null {
  return process.env.TALY_OAUTH_CLIENT_ID?.trim() || null;
}

export function getTalyOauthClientSecret(): string | null {
  return process.env.TALY_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function talyOauthClientConfiguredFromEnv(): boolean {
  return Boolean(getTalyOauthClientId() && getTalyOauthClientSecret());
}

/**
 * OAuth client Basic header for POST /uaa/oauth/token.
 * Requires TALY_OAUTH_CLIENT_ID + TALY_OAUTH_CLIENT_SECRET in Production (never log these).
 * Non-production may fall back to the Taly docs sandbox client when env is unset.
 */
export function getTalyOauthClientBasic(): string {
  const id = getTalyOauthClientId();
  const secret = getTalyOauthClientSecret();
  if (id && secret) {
    return `Basic ${Buffer.from(`${id}:${secret}`, "utf8").toString("base64")}`;
  }
  if (isProductionRuntime()) {
    throw new Error(
      "Taly OAuth client is required in Production. Set TALY_OAUTH_CLIENT_ID and TALY_OAUTH_CLIENT_SECRET.",
    );
  }
  return `Basic ${Buffer.from(
    `${TALY_DOCS_OAUTH_CLIENT_ID}:${TALY_DOCS_OAUTH_CLIENT_SECRET}`,
    "utf8",
  ).toString("base64")}`;
}

export function getTalyBaseUrl(): string {
  const explicit = process.env.TALY_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return isProductionRuntime() ? TALY_PRODUCTION_BASE_URL : TALY_SANDBOX_BASE_URL;
}

export function getTalyBaseHost(): string {
  try {
    return new URL(getTalyBaseUrl()).host;
  } catch {
    return "invalid-taly-base-url";
  }
}

export type TalyBaseUrlAlignment = {
  host: string;
  kind: "production" | "sandbox" | "custom" | "invalid";
  productionRuntime: boolean;
  /** True when production runtime points at sandbox host (or the reverse). */
  mismatched: boolean;
};

export function getTalyBaseUrlAlignment(): TalyBaseUrlAlignment {
  const productionRuntime = isProductionRuntime();
  let host = "invalid-taly-base-url";
  let kind: TalyBaseUrlAlignment["kind"] = "invalid";
  try {
    host = new URL(getTalyBaseUrl()).host;
    if (host === "api.taly.io") kind = "production";
    else if (host === "api.dev-taly.io") kind = "sandbox";
    else kind = "custom";
  } catch {
    kind = "invalid";
  }
  const mismatched =
    (productionRuntime && kind === "sandbox") || (!productionRuntime && kind === "production");
  return { host, kind, productionRuntime, mismatched };
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
