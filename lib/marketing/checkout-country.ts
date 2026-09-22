/**
 * Shared country for marketing prices and checkout so Enrol never flips currency.
 */

import { cookies, headers } from "next/headers";

import {
  CHECKOUT_COUNTRY_COOKIE,
  detectCheckoutCurrency,
} from "@/services/payments/currency-detection";

export async function resolveRequestCheckoutCountry(explicit?: string | null): Promise<string> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const detection = detectCheckoutCurrency({
    country: explicit,
    cookieCountry: cookieStore.get(CHECKOUT_COUNTRY_COOKIE)?.value,
    geoCountry:
      headerStore.get("cf-ipcountry") ??
      headerStore.get("x-vercel-ip-country") ??
      headerStore.get("x-country-code") ??
      headerStore.get("cloudfront-viewer-country"),
    locale: headerStore.get("accept-language"),
  });
  return detection.country;
}
