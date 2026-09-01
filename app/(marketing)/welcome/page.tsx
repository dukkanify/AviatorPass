import type { Metadata } from "next";
import { Suspense } from "react";

import { WelcomeView } from "@/features/payments/components/welcome-view";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = {
  title: "Payment Successful",
  description:
    "Your payment has been successfully received and your enrollment is confirmed. Welcome to Aviator Pass.",
};

export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingState label="Confirming your enrollment..." />}>
      <WelcomeView />
    </Suspense>
  );
}
