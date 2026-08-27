"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordSchema } from "@/utils/validation";
import { authFetch } from "@/features/auth/services/auth-api";
import { routes } from "@/constants/routes";
import { useAuth } from "@/providers/auth-provider";
import type { UserProfile } from "@/types";

function ChangePasswordForm() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }

    setPending(true);
    try {
      const result = await authFetch<{ user: UserProfile; redirectTo: string }>(
        routes.api.auth.changePassword,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Unable to update password");
        return;
      }
      setUser(result.data.user);
      toast.success("Password updated");
      router.replace(result.data.redirectTo);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {user?.mustChangePassword ? (
        <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          For your security, choose a new password before opening the dashboard. Use the temporary
          password from your welcome email as the current password.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Update password"}
      </Button>
    </form>
  );
}

export { ChangePasswordForm };
