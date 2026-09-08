/**
 * Tamara checkout session creation — mocked HTTP, no live Tamara calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getPaymentGateway } from "@/services/payments/gateway";
import { payGuestCheckout, quoteGuestCheckout } from "@/services/payments/purchase-first-service";
import { formatTamaraAmount } from "@/services/payments/money";
import { TamaraGateway } from "@/services/payments/tamara-gateway";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.TAMARA_API_TOKEN = "test-tamara-api-token";
  process.env.TAMARA_BASE_URL = "https://api-sandbox.tamara.co";
  delete process.env.STRIPE_SECRET_KEY;
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("Tamara checkout creation", () => {
  it("routes Tamara through TamaraGateway without changing the default Stripe/mock gateway", () => {
    expect(getPaymentGateway().provider).toBe("mock");
    expect(getPaymentGateway("tamara")).toBeInstanceOf(TamaraGateway);
  });

  it("converts minor units to Tamara major amounts", () => {
    expect(formatTamaraAmount(15000, "SAR")).toBe(150);
    expect(formatTamaraAmount(1500, "KWD")).toBe(1.5);
  });

  it("creates a Tamara checkout session and returns the hosted URL", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(_input);
      expect(url).toBe("https://api-sandbox.tamara.co/checkout");
      expect(init?.method ?? "POST").toBe("POST");
      return new Response(
        JSON.stringify({
          order_id: "tamara-order-1",
          checkout_id: "tamara-checkout-1",
          checkout_url: "https://checkout.tamara.co/checkout/tamara-checkout-1",
          status: "new",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const email = `tamara.guest.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Mona",
      lastName: "Lisa",
      email,
      phone: "+971501234567",
      country: "AE",
      billingName: "Mona Lisa",
      billingAddress: "Dubai Marina",
      methodBrand: "tamara",
      idempotencyKey: `tamara-ok-${Date.now()}`,
    });

    expect(result.checkoutUrl).toContain("checkout.tamara.co");
    expect(result.order.status).toBe("pending");
    expect(result.accountCreated).toBe(false);
    expect(result.payment?.provider).toBe("tamara");
    expect(result.payment?.providerPaymentId).toBe("tamara-order-1");
    expect(result.payment?.status).toBe("requires_payment");
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      country_code: string;
      merchant_url: { success: string; cancel: string; notification: string };
      consumer: { phone_number: string };
    };
    expect(body.country_code).toBe("AE");
    expect(body.merchant_url.success).toContain("/payment/success");
    expect(body.merchant_url.cancel).toContain("/payment/cancel");
    expect(body.merchant_url.notification).toContain("/api/payments/tamara/webhook");
    expect(body.consumer.phone_number).toBe("501234567");
  });

  it("keeps Tamara coming soon when the token is missing", () => {
    delete process.env.TAMARA_API_TOKEN;
    const quote = quoteGuestCheckout(undefined, "SA");
    expect(quote.methods.find((m) => m.id === "tamara")?.available).toBe(false);
  });
});
