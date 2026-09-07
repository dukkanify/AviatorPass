import type { Metadata } from "next";
import { Suspense } from "react";

import { PaymentCancelView } from "@/features/payments/components/payment-cancel-view";
import { LoadingState } from "@/components/shared/loading-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout cancelled — AviatorPass",
  description: "No charge was made. You can return to Stripe Checkout when you are ready.",
};

export default function PaymentCancelPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading..." />}>
      <PaymentCancelView />
    </Suspense>
  );
}
