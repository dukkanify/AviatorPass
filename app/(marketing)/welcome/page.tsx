import type { Metadata } from "next";
import { Suspense } from "react";

import { WelcomeView } from "@/features/payments/components/welcome-view";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = {
  title: "Welcome to ATPL PASS",
  description: "Enrollment successful. Your AviatorPass account and course access are ready.",
};

export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingState label="Confirming your enrollment..." />}>
      <WelcomeView />
    </Suspense>
  );
}
