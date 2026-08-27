"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";

function StripeCheckoutRedirect() {
  const search = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const canceled = search.get("canceled") === "1";
  const productId = search.get("productId") ?? "";

  const start = React.useCallback(async () => {
    setPending(true);
    setError(null);
    const result = await authFetch<{ checkoutUrl: string }>("/api/public/checkout/session", {
      method: "POST",
      body: JSON.stringify({
        productId: productId || undefined,
        locale: typeof navigator !== "undefined" ? navigator.language : undefined,
      }),
    });
    if (!result.success || !result.data?.checkoutUrl) {
      setError(result.error ?? "Unable to open Stripe Checkout.");
      setPending(false);
      return;
    }
    window.location.assign(result.data.checkoutUrl);
  }, [productId]);

  React.useEffect(() => {
    if (canceled) return;
    void start();
  }, [canceled, start]);

  return (
    <div className="container-app mx-auto max-w-lg py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
        Secure checkout
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {canceled ? "Checkout cancelled" : "Redirecting to Stripe"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {canceled
          ? "No charge was made. Continue when you are ready — Stripe collects your name, email, billing address, and country."
          : "Opening Stripe Checkout. Apple Pay, Google Pay, cards, Link, and local methods appear automatically for your country."}
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          variant="accent"
          disabled={pending}
          onClick={() => {
            void start();
          }}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Opening Stripe…
            </>
          ) : (
            "Continue to Stripe Checkout"
          )}
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home}>Back to home</Link>
        </Button>
      </div>
      <ul className="mx-auto mt-8 max-w-sm space-y-2 text-left text-sm text-muted-foreground">
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-4 text-accent" />
          Pay first — your student account is created after a successful payment.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 text-accent" />
          Currency is selected from your country. Amounts come from Stripe Prices, never in-app FX.
        </li>
      </ul>
      {error ? (
        <p className="mt-6 text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href={routes.login} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export { StripeCheckoutRedirect };
