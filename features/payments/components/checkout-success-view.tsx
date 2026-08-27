"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";

type Snapshot = {
  orderNumber: string;
  status: string;
  totalLabel: string;
  productName: string;
  billingEmail: string;
  accountCreated: boolean;
  attachedToExisting: boolean;
  emailSent: boolean;
  courseAssigned: boolean;
  failureReason: string | null;
};

function CheckoutSuccessView() {
  const search = useSearchParams();
  const orderId = search.get("order") ?? search.get("orderId");
  const [order, setOrder] = React.useState<Snapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orderId) return;
    void authFetch<Snapshot>(`/api/public/checkout?orderId=${encodeURIComponent(orderId)}`).then(
      (r) => {
        if (!r.success || !r.data) {
          setError(r.error ?? "We could not load this order.");
          return;
        }
        setOrder(r.data);
      },
    );
  }, [orderId]);

  if (error) {
    return (
      <div className="container-app py-16 text-center">
        <p className="text-destructive">{error}</p>
        <Button className="mt-4" asChild>
          <Link href={routes.checkout}>Return to checkout</Link>
        </Button>
      </div>
    );
  }

  if (orderId && !order) {
    return (
      <div className="container-app flex flex-col items-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        Confirming your payment…
      </div>
    );
  }

  return (
    <div className="container-app mx-auto max-w-xl py-16 text-center">
      <CheckCircle2 className="mx-auto size-12 text-accent" />
      <h1 className="mt-4 font-display text-3xl font-semibold">Payment received</h1>
      <p className="mt-3 text-muted-foreground">
        {order
          ? `${order.productName} is ready. ${
              order.accountCreated
                ? "Your student account was created automatically."
                : order.attachedToExisting
                  ? "This purchase is on your existing account."
                  : "If this is your first purchase, check your email for login details."
            } We emailed ${order.billingEmail || "you"} a receipt and access instructions.`
          : "If you paid with Apple Pay, Google Pay, or card, check your email for login details and course access."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="accent" asChild>
          <Link href={routes.login}>Sign in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home}>Home</Link>
        </Button>
      </div>
      {order ? (
        <p className="mt-6 text-xs text-muted-foreground">
          {order.orderNumber} · {order.totalLabel}
          {order.courseAssigned ? " · Course assigned" : ""}
          {order.emailSent ? " · Email sent" : ""}
        </p>
      ) : null}
    </div>
  );
}

export { CheckoutSuccessView };
