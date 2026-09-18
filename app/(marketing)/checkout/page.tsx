import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestCheckoutView } from "@/features/payments/components/guest-checkout-view";
import { LoadingState } from "@/components/shared/loading-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secure checkout — Enrol in Aviator Pass",
  description:
    "Pay for Aviator Pass first. Choose your study start date and first lecture time, then complete payment. Your student account is created automatically after successful payment.",
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingState label="Opening secure checkout..." />}>
      <GuestCheckoutView />
    </Suspense>
  );
}
