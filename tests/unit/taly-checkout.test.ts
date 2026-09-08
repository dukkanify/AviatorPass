/**
 * Taly checkout session creation — mocked HTTP, no live Taly calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/api-guard", () => ({
  enforceMutatingApiSecurity: async () => null,
}));

import { POST as talyCreateOrderPost } from "@/app/api/payments/taly/create-order/route";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getPaymentGateway } from "@/services/payments/gateway";
import { payGuestCheckout, quoteGuestCheckout } from "@/services/payments/purchase-first-service";
import { formatTamaraAmount } from "@/services/payments/money";
import { resetTalyTokenCache } from "@/services/payments/taly-client";
import { TalyGateway } from "@/services/payments/taly-gateway";

const ORIGINAL_ENV = { ...process.env };

function mockTalyFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/uaa/oauth/token")) {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBeTruthy();
      return new Response(
        JSON.stringify({
          access_token: "taly-access-token",
          expires_in: 3600,
          token_type: "bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/accounts/payment/v2/initiate")) {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer taly-access-token");
      expect(headers.get("X-Api-Key")).toBe("test-taly-api-key");
      expect(headers.get("X-Api-Secret")).toBe("test-taly-secret-key");
      return new Response(
        JSON.stringify({
          talyOrderId: 7913,
          orderToken: "taly-order-token-1",
          secureCheckoutUrl: "https://www.dev-taly.io/checkout/securecheckout/taly-order-token-1",
          orderStatus: "INITIATED",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ orderStatus: "INITIATED" }), { status: 200 });
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-auth-secret-value-32chars";
  process.env.TALY_API_KEY = "test-taly-api-key";
  process.env.TALY_SECRET_KEY = "test-taly-secret-key";
  process.env.TALY_WEBHOOK_SECRET = "test-taly-webhook-secret";
  process.env.TALY_BASE_URL = "https://api.dev-taly.io";
  delete process.env.STRIPE_SECRET_KEY;
  resetTalyTokenCache();
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensurePaymentsSeeded();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTalyTokenCache();
  process.env = { ...ORIGINAL_ENV };
});

describe("Taly checkout creation", () => {
  it("routes Taly through TalyGateway without changing the default Stripe/mock gateway", () => {
    expect(getPaymentGateway().provider).toBe("mock");
    expect(getPaymentGateway("taly")).toBeInstanceOf(TalyGateway);
    expect(getPaymentGateway("tamara").provider).toBe("tamara");
  });

  it("converts minor units to Taly major amounts for existing currencies", () => {
    expect(formatTamaraAmount(15000, "SAR")).toBe(150);
    expect(formatTamaraAmount(1500, "KWD")).toBe(1.5);
    expect(formatTamaraAmount(1999, "USD")).toBe(19.99);
    expect(formatTamaraAmount(25000, "AED")).toBe(250);
  });

  it("creates a Taly checkout session and returns the hosted URL", async () => {
    const fetchMock = mockTalyFetch();
    vi.stubGlobal("fetch", fetchMock);

    const email = `taly.guest.${Date.now()}@aviatorpass.test`;
    const result = await payGuestCheckout({
      firstName: "Omar",
      lastName: "Pilot",
      email,
      phone: "+96555555333",
      country: "KW",
      billingName: "Omar Pilot",
      billingAddress: "Kuwait City",
      methodBrand: "taly",
      idempotencyKey: `taly-ok-${Date.now()}`,
    });

    expect(result.checkoutUrl).toContain("dev-taly.io/checkout");
    expect(result.order.status).toBe("pending");
    expect(result.accountCreated).toBe(false);
    expect(result.payment?.provider).toBe("taly");
    expect(result.payment?.checkoutSessionId).toBe("taly-order-token-1");
    expect(result.payment?.status).toBe("requires_payment");

    const initiateCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/accounts/payment/v2/initiate"),
    );
    expect(initiateCall).toBeTruthy();
    const body = JSON.parse(String(initiateCall?.[1]?.body ?? "{}")) as {
      currency: string;
      merchantRedirectUrl: string;
      postBackUrl: string;
      customerDetails: { phoneNumber: string; countryCode: string };
      totalAmount: number;
    };
    expect(body.currency).toBe("KWD");
    expect(body.currency).not.toBe("AED");
    expect(body.merchantRedirectUrl).toContain("/payment/success");
    expect(body.postBackUrl).toContain("/api/payments/taly/webhook");
    expect(body.customerDetails.countryCode).toBe("965");
    expect(body.customerDetails.phoneNumber).toBe("55555333");
    expect(typeof body.totalAmount).toBe("number");
  });

  it("hides Taly completely when merchant keys are missing", () => {
    delete process.env.TALY_API_KEY;
    delete process.env.TALY_SECRET_KEY;
    const quote = quoteGuestCheckout(undefined, "KW");
    expect(quote.methods.find((m) => m.id === "taly")).toBeUndefined();
  });

  it("offers Taly only for Kuwait when configured", () => {
    const kuwait = quoteGuestCheckout(undefined, "KW");
    expect(kuwait.methods.find((m) => m.id === "taly")?.available).toBe(true);
    expect(
      quoteGuestCheckout(undefined, "US").methods.find((m) => m.id === "taly"),
    ).toBeUndefined();
    expect(
      quoteGuestCheckout(undefined, "AE").methods.find((m) => m.id === "taly"),
    ).toBeUndefined();
  });

  it("exposes POST /api/payments/taly/create-order", async () => {
    vi.stubGlobal("fetch", mockTalyFetch());
    const res = await talyCreateOrderPost(
      new Request("https://www.aviatorpass.com/api/payments/taly/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Sara",
          lastName: "Student",
          email: `taly.create.${Date.now()}@aviatorpass.test`,
          phone: "+96550001111",
          country: "KW",
          billingAddress: "Salmiya",
          idempotencyKey: `taly-create-${Date.now()}`,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { checkoutUrl: string; orderToken: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.checkoutUrl).toContain("dev-taly.io");
    expect(json.data.orderToken).toBe("taly-order-token-1");
  });
});
