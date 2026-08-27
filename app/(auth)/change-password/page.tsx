import type { Metadata } from "next";

import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Change password",
  description: "Choose a new password for your AviatorPass account.",
};

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--accent)_0%,_transparent_50%)] opacity-[0.07]" />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle>Change your password</CardTitle>
          <CardDescription>
            First-time ATPL PASS students must replace the generated password before entering the
            dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
