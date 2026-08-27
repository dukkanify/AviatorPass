import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestCheckoutView } from "@/features/payments/components/guest-checkout-view";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = {
  title: "Secure checkout — Enrol in ATPL PASS",
  description:
    "Pay for ATPL PASS first. AviatorPass creates your student account automatically after successful payment.",
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingState label="Opening secure checkout..." />}>
      <GuestCheckoutView />
    </Suspense>
  );
}
