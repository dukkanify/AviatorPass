"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";

type StripeCheckoutRedirectProps = {
  initialError?: string | null;
};

function StripeCheckoutRedirect({ initialError }: StripeCheckoutRedirectProps) {
  const search = useSearchParams();
  const canceled = search.get("canceled") === "1";
  const productId = search.get("productId") ?? "";
  const retryHref = productId
    ? `${routes.checkout}?start=1&productId=${encodeURIComponent(productId)}`
    : `${routes.checkout}?start=1`;

  return (
    <div className="container-app mx-auto max-w-lg py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
        Secure checkout
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {canceled ? "Checkout cancelled" : "Continue to Stripe Checkout"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {canceled
          ? "No charge was made. Continue when you are ready — Stripe collects your name, email, billing address, and country."
          : "Enrol in ATPL PASS opens Stripe Checkout immediately. Apple Pay, Google Pay, cards, Link, and local methods appear automatically for your country."}
      </p>
      {initialError ? <p className="mt-4 text-sm text-destructive">{initialError}</p> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="accent" asChild>
          <Link href={retryHref}>Continue to Stripe Checkout</Link>
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
      <p className="mt-6 text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href={routes.login} className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export { StripeCheckoutRedirect };
