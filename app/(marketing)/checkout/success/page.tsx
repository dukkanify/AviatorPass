import type { Metadata } from "next";
import { Suspense } from "react";

import { CheckoutSuccessView } from "@/features/payments/components/checkout-success-view";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = {
  title: "Payment confirmation",
};

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<LoadingState label="Confirming payment..." />}>
      <CheckoutSuccessView />
    </Suspense>
  );
}
