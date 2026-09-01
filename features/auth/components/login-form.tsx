"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { loginSchema } from "@/utils/validation";
import { sanitizeEmail } from "@/utils/sanitize";
import { authFetch } from "@/features/auth/services/auth-api";
import { routes } from "@/constants/routes";
import { useAuth } from "@/providers/auth-provider";
import type { UserProfile } from "@/types";

function LoginForm() {
  const router = useRouter();
  const { user, isLoading, signOut, setUser } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [clearedPriorSession, setClearedPriorSession] = React.useState(false);
  const completingRef = React.useRef(false);

  React.useEffect(() => {
    if (completingRef.current) return;
    if (isLoading || !user) return;
    setClearedPriorSession(true);
    void signOut();
  }, [isLoading, user, signOut]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({
      email: sanitizeEmail(email),
      rememberMe,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }

    setPending(true);
    try {
      if (user) {
        await signOut();
      }

      if (password.trim()) {
        const result = await authFetch<{
          user: UserProfile;
          redirectTo: string;
          mustChangePassword?: boolean;
        }>(routes.api.auth.login, {
          method: "POST",
          body: JSON.stringify({
            email: parsed.data.email,
            password,
            rememberMe: parsed.data.rememberMe,
          }),
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Unable to sign in");
          return;
        }
        completingRef.current = true;
        setUser(result.data.user);
        toast.success(
          result.data.mustChangePassword
            ? "Signed in — choose a new password to continue."
            : "Signed in",
        );
        router.replace(result.data.redirectTo);
        return;
      }

      const result = await authFetch<{ email: string; demoOtp?: string }>(
        routes.api.auth.requestOtp,
        {
          method: "POST",
          body: JSON.stringify({ ...parsed.data, purpose: "login" }),
        },
      );

      if (!result.success) {
        toast.error(result.error ?? "Unable to send OTP");
        return;
      }

      if (result.data?.demoOtp) {
        toast.message(`Demo OTP: ${result.data.demoOtp}`);
      } else {
        toast.success("Check your email for a one-time code");
      }

      const params = new URLSearchParams({
        email: result.data?.email ?? parsed.data.email,
        purpose: "login",
      });
      router.push(`${routes.verifyOtp}?${params.toString()}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {clearedPriorSession ? (
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Switching accounts — sign in with the student, instructor, or admin email you want.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="student@aviatorpass.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Temporary password, or blank for OTP"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Just bought Aviator Pass? Paste the temporary password here. Leave blank only if you want
          a one-time email code instead.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
        Remember me for 30 days
      </label>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : password.trim() ? "Sign in" : "Continue with email"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href={routes.forgotPassword} className="text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export { LoginForm };
