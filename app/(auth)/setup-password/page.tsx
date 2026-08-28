import { Suspense } from "react";
import type { Metadata } from "next";

import { SetupPasswordForm } from "@/features/auth/components/setup-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = {
  title: "Set your password",
};

export default function SetupPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--accent)_0%,_transparent_50%)] opacity-[0.07]" />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Choose a secure password to finish your ATPL PASS enrollment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoadingState label="Loading..." />}>
            <SetupPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
