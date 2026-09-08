/**
 * Taly HTTP client — login, initiate, get order, cancel, refund.
 * Merchant API Key + Secret authenticate every request (OAuth password grant, then Bearer).
 * Never logs keys, secrets, or access tokens.
 */

import { PaymentError } from "@/services/payments/access";
import {
  TALY_OAUTH_CLIENT_BASIC,
  getTalyApiKey,
  getTalyBaseUrl,
  getTalySecretKey,
  isTalyConfigured,
} from "@/services/payments/taly-config";
import { logTalyEvent } from "@/services/payments/taly-logging";

export type TalyInitiateResponse = {
  talyOrderId: number | string;
  orderToken: string;
  secureCheckoutUrl: string;
  orderStatus?: string;
  merchantRedirectUrl?: string;
  currency?: string;
  totalAmount?: number;
};

export type TalyOrderDetails = {
  talyOrderId?: number | string;
  orderToken?: string;
  merchantOrderId?: string;
  orderStatus?: string;
  currency?: string;
  totalAmount?: number;
  secureCheckoutUrl?: string;
  [key: string]: unknown;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: CachedToken | null = null;

function requireConfigured() {
  if (!isTalyConfigured()) {
    throw new PaymentError(
      "Taly is not configured. Set TALY_API_KEY and TALY_SECRET_KEY to enable Taly checkout.",
      503,
    );
  }
}

function errorMessageFromBody(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error_description === "string" && record.error_description.trim()) {
      return record.error_description;
    }
    if (typeof record.error === "string" && record.error.trim()) return record.error;
  }
  return `Taly request failed (${status})`;
}

async function parseJson(text: string): Promise<unknown> {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 400) };
  }
}

async function loginTaly(): Promise<string> {
  requireConfigured();
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const username = getTalyApiKey()!;
  const password = getTalySecretKey()!;
  const url = `${getTalyBaseUrl()}/uaa/oauth/token`;
  const form = new URLSearchParams({
    username,
    password,
    grant_type: "password",
    scope: "api",
  });

  const attempts: Array<{ authorization: string; contentType: string; body: string }> = [
    {
      authorization: TALY_OAUTH_CLIENT_BASIC,
      contentType: "application/x-www-form-urlencoded",
      body: form.toString(),
    },
    {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      contentType: "application/x-www-form-urlencoded",
      body: form.toString(),
    },
    {
      authorization: TALY_OAUTH_CLIENT_BASIC,
      contentType: "application/json",
      body: JSON.stringify({
        username,
        password,
        grant_type: "password",
        scope: "api",
      }),
    },
  ];

  let lastStatus = 0;
  let lastJson: unknown = null;
  for (const attempt of attempts) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: attempt.authorization,
        "Content-Type": attempt.contentType,
        Accept: "application/json",
      },
      body: attempt.body,
    });
    const text = await response.text();
    const json = await parseJson(text);
    lastStatus = response.status;
    lastJson = json;
    if (!response.ok) continue;
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    const accessToken =
      (typeof record.access_token === "string" && record.access_token) ||
      (typeof record.accessToken === "string" && record.accessToken) ||
      "";
    if (!accessToken) continue;
    const expiresIn =
      typeof record.expires_in === "number" && record.expires_in > 0 ? record.expires_in : 86_400;
    tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
    return accessToken;
  }

  logTalyEvent({
    level: "error",
    message: "Merchant login failed",
    path: "/uaa/oauth/token",
    details: {
      status: lastStatus,
      error: errorMessageFromBody(lastJson, lastStatus).slice(0, 200),
    },
  });
  throw new PaymentError(errorMessageFromBody(lastJson, lastStatus || 401), 502);
}

async function talyFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<T> {
  requireConfigured();
  const token = await loginTaly();
  const apiKey = getTalyApiKey()!;
  const secret = getTalySecretKey()!;
  const base = getTalyBaseUrl();
  const url = new URL(
    path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Secret": secret,
  };

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
  const text = await response.text();
  const json = await parseJson(text);
  if (!response.ok) {
    if (response.status === 401) {
      tokenCache = null;
    }
    const message = errorMessageFromBody(json, response.status);
    logTalyEvent({
      level: "error",
      message: "Taly API error",
      path,
      details: { status: response.status, error: message.slice(0, 200) },
    });
    throw new PaymentError(
      message,
      response.status >= 500 ? 502 : response.status === 422 ? 409 : 400,
    );
  }
  return json as T;
}

export function resetTalyTokenCache() {
  tokenCache = null;
}

export async function initiateTalyOrder(
  body: Record<string, unknown>,
): Promise<TalyInitiateResponse> {
  const result = await talyFetch<TalyInitiateResponse>("/accounts/payment/v2/initiate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result?.secureCheckoutUrl || !result.orderToken) {
    throw new PaymentError("Taly did not return a hosted checkout URL", 502);
  }
  return result;
}

export async function getTalyOrder(merchantOrderId: string): Promise<TalyOrderDetails> {
  return talyFetch<TalyOrderDetails>("/accounts/merchant/orders", {
    method: "GET",
    query: { merchantOrderId },
  });
}

export async function cancelTalyOrder(orderToken: string): Promise<Record<string, unknown>> {
  return talyFetch<Record<string, unknown>>(
    `/accounts/payment/cancel/${encodeURIComponent(orderToken)}`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function refundTalyOrder(input: {
  orderToken: string;
  merchantOrderId: string;
  refundAmount: number;
  currency: string;
  reason?: string;
}): Promise<Record<string, unknown>> {
  return talyFetch<Record<string, unknown>>(
    `/accounts/payment/refund/${encodeURIComponent(input.orderToken)}`,
    {
      method: "POST",
      body: JSON.stringify({
        merchantOrderId: input.merchantOrderId,
        refundAmount: input.refundAmount,
        currency: input.currency,
        reason: input.reason ?? "AviatorPass refund",
      }),
    },
  );
}
