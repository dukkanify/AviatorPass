"use client";

import * as React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";

type SessionPayload = {
  sessionId: string;
  status: string;
  paid: boolean;
  enrollmentPending: boolean;
  currency: string;
  amount: number;
  courseId: string;
};

function PaymentSuccessView() {
  const search = useSearchParams();
  const sessionId = search.get("session_id") ?? search.get("sessionId") ?? "";
  const [data, setData] = React.useState<SessionPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tries, setTries] = React.useState(0);

  React.useEffect(() => {
    if (!sessionId) {
      setError("Missing Checkout session. If you just paid, check your email confirmation.");
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/payments/session?session_id=${encodeURIComponent(sessionId)}`,
          { credentials: "include" },
        );
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: SessionPayload;
          error?: string | null;
        } | null;
        if (cancelled) return;
        if (json?.success && json.data) {
          setData(json.data);
          setError(null);
          return;
        }
        if (tries < 8) {
          window.setTimeout(() => setTries((n) => n + 1), 1500);
          return;
        }
        setError(json?.error ?? "We are still confirming your payment. Refresh shortly.");
      } catch {
        if (cancelled) return;
        if (tries < 8) {
          window.setTimeout(() => setTries((n) => n + 1), 1500);
          return;
        }
        setError("Could not confirm payment status.");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, tries]);

  const paid = data?.paid || data?.status === "paid";

  return (
    <div className="container-app mx-auto max-w-lg py-16 text-center">
      {paid ? (
        <CheckCircle2 className="mx-auto size-12 text-accent" />
      ) : error ? (
        <XCircle className="mx-auto size-12 text-destructive" />
      ) : (
        <Loader2 className="mx-auto size-12 animate-spin text-accent" />
      )}
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        {paid ? "Payment successful" : error ? "Payment status" : "Confirming your payment"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {paid
          ? "Your enrolment is being activated. A confirmation email and in-app notification are on the way."
          : error
            ? error
            : "Your payment is being confirmed. This page updates automatically."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="accent" asChild>
          <Link href={`${routes.welcome}?session_id=${encodeURIComponent(sessionId)}`}>
            Continue
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home}>Home</Link>
        </Button>
      </div>
    </div>
  );
}

export { PaymentSuccessView };
