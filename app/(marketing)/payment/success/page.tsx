import type { Metadata } from "next";
import { Suspense } from "react";

import { PaymentSuccessView } from "@/features/payments/components/payment-success-view";
import { LoadingState } from "@/components/shared/loading-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment successful — AviatorPass",
  description: "Your Aviator Pass payment was received and enrolment is being confirmed.",
};

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<LoadingState label="Confirming your payment..." />}>
      <PaymentSuccessView />
    </Suspense>
  );
}
