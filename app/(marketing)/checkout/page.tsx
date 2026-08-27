import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GuestCheckoutView } from "@/features/payments/components/guest-checkout-view";
import { StripeCheckoutRedirect } from "@/features/payments/components/stripe-checkout-redirect";
import { LoadingState } from "@/components/shared/loading-state";
import { isLikelyCrawler } from "@/lib/http/crawler";
import { PaymentError } from "@/services/payments/access";
import { startHostedCheckout } from "@/services/payments/purchase-first-service";
import { isStripeConfigured } from "@/services/payments/stripe-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secure checkout — Enrol in ATPL PASS",
  description:
    "Pay for ATPL PASS first. AviatorPass creates your student account automatically after successful payment.",
};

type CheckoutSearch = {
  canceled?: string;
  productId?: string;
  start?: string;
};

type PageProps = {
  searchParams?: Promise<CheckoutSearch>;
};

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

async function readSearch(searchParams: PageProps["searchParams"]): Promise<CheckoutSearch> {
  return (await searchParams) ?? {};
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const params = await readSearch(searchParams);
  const hosted = isStripeConfigured();

  if (!hosted) {
    return (
      <Suspense fallback={<LoadingState label="Opening secure checkout..." />}>
        <GuestCheckoutView />
      </Suspense>
    );
  }

  const canceled = params.canceled === "1";
  const headerList = await headers();
  const crawler = isLikelyCrawler(headerList.get("user-agent"));
  const forceStart = params.start === "1";

  if (!canceled && (!crawler || forceStart)) {
    try {
      const geo =
        headerList.get("cf-ipcountry") ??
        headerList.get("x-vercel-ip-country") ??
        headerList.get("x-country-code");
      const forwarded = headerList.get("x-forwarded-for");
      const result = await startHostedCheckout({
        productId: params.productId,
        locale: headerList.get("accept-language"),
        geoCountry: geo,
        ipAddress: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip"),
      });
      redirect(result.checkoutUrl);
    } catch (error) {
      if (isNextRedirect(error)) throw error;
      const message =
        error instanceof PaymentError ? error.message : "Unable to open Stripe Checkout.";
      return (
        <Suspense fallback={<LoadingState label="Opening secure checkout..." />}>
          <StripeCheckoutRedirect initialError={message} />
        </Suspense>
      );
    }
  }

  return (
    <Suspense fallback={<LoadingState label="Opening secure checkout..." />}>
      <StripeCheckoutRedirect />
    </Suspense>
  );
}
