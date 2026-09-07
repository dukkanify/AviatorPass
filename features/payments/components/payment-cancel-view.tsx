"use client";

import { useSearchParams } from "next/navigation";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";

function PaymentCancelView() {
  const search = useSearchParams();
  const sessionId = search.get("session_id") ?? "";

  return (
    <div className="container-app mx-auto max-w-lg py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
        Checkout cancelled
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        No charge was made
      </h1>
      <p className="mt-3 text-muted-foreground">
        You left Stripe Checkout before paying. Your enrolment stays pending until you complete
        payment.
      </p>
      {sessionId ? (
        <p className="mt-2 text-xs text-muted-foreground">Session {sessionId.slice(0, 18)}…</p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="accent" asChild>
          <Link href={`${routes.checkout}?start=1`}>Return to checkout</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home}>Home</Link>
        </Button>
      </div>
    </div>
  );
}

export { PaymentCancelView };
