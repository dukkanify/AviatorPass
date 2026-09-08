/**
 * Tamara HTTP client — checkout, authorise, capture. Never logs tokens.
 */

import { PaymentError } from "@/services/payments/access";
import {
  getTamaraApiToken,
  getTamaraBaseUrl,
  isTamaraConfigured,
} from "@/services/payments/tamara-config";
import { logTamaraEvent } from "@/services/payments/tamara-logging";

export type TamaraMoney = { amount: number; currency: string };

export type TamaraCheckoutResponse = {
  order_id: string;
  checkout_id?: string;
  checkout_url: string;
  status?: string;
};

async function tamaraFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  if (!isTamaraConfigured()) {
    throw new PaymentError(
      "Tamara is not configured. Set TAMARA_API_TOKEN to enable Tamara checkout.",
      503,
    );
  }
  const url = `${getTamaraBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getTamaraApiToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
  };
  const response = await fetch(url, {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { message: text.slice(0, 400) };
    }
  }
  if (!response.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && typeof json.message === "string"
        ? json.message
        : null) || `Tamara request failed (${response.status})`;
    logTamaraEvent({
      level: "error",
      message: "Tamara API error",
      path: path,
      details: { status: response.status, error: message.slice(0, 200) },
    });
    throw new PaymentError(message, response.status >= 500 ? 502 : 400);
  }
  return json as T;
}

export async function createTamaraCheckoutSession(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<TamaraCheckoutResponse> {
  const result = await tamaraFetch<TamaraCheckoutResponse>("/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey,
  });
  if (!result?.checkout_url || !result.order_id) {
    throw new PaymentError("Tamara did not return a checkout URL", 502);
  }
  return result;
}

export async function authoriseTamaraOrder(orderId: string): Promise<Record<string, unknown>> {
  return tamaraFetch<Record<string, unknown>>(`/orders/${encodeURIComponent(orderId)}/authorise`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function captureTamaraOrder(input: {
  orderId: string;
  amount: TamaraMoney;
}): Promise<Record<string, unknown>> {
  return tamaraFetch<Record<string, unknown>>("/payments/capture", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      total_amount: input.amount,
    }),
  });
}
