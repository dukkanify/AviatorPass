"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Download,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Mail,
} from "lucide-react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";

type WelcomeSnapshot = {
  orderNumber: string;
  status: string;
  productName: string;
  billingEmail: string;
  accountCreated: boolean;
  attachedToExisting: boolean;
  emailSent: boolean;
  courseAssigned: boolean;
  paymentStatus: string;
  amountLabel: string;
  invoicePrintUrl: string | null;
  receiptUrl: string | null;
  loginUrl: string;
  courseAccessUrl: string;
  dashboardUrl: string;
  setupPasswordPath: string;
  supportEmail: string;
};

function WelcomeView() {
  const search = useSearchParams();
  const sessionId = search.get("session_id") ?? search.get("sessionId");
  const orderId = search.get("orderId");
  const [data, setData] = React.useState<WelcomeSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tries, setTries] = React.useState(0);

  React.useEffect(() => {
    if (!sessionId && !orderId) {
      setError("Missing checkout session. If you just paid, check the confirmation email.");
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const qs = sessionId
        ? `session_id=${encodeURIComponent(sessionId)}`
        : `orderId=${encodeURIComponent(orderId!)}`;
      try {
        const res = await fetch(`/api/public/checkout/welcome?${qs}`, {
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: WelcomeSnapshot;
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
        setError(json?.error ?? "We are still confirming your payment. Refresh this page shortly.");
      } catch {
        if (cancelled) return;
        if (tries < 8) {
          window.setTimeout(() => setTries((n) => n + 1), 1500);
          return;
        }
        setError("We are still confirming your payment. Refresh this page shortly.");
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, orderId, tries]);

  if (!data && !error) {
    return (
      <div className="container-app flex flex-col items-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        Confirming your enrollment…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container-app mx-auto max-w-lg py-16 text-center">
        <p className="text-destructive">{error}</p>
        <div className="mt-6 flex w-full flex-col justify-center gap-3 sm:flex-row">
          <Button variant="accent" className="w-full sm:w-auto" asChild>
            <Link href={routes.login}>Sign in</Link>
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link href={routes.checkout}>Return to checkout</Link>
          </Button>
        </div>
      </div>
    );
  }

  const paid = data?.status === "paid" || data?.paymentStatus === "succeeded";

  return (
    <div className="container-app mx-auto max-w-2xl py-14">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-accent" />
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
          {paid ? "Enrollment successful" : "Payment received"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Payment Successful
        </h1>
        <p className="mt-3 text-muted-foreground">
          Your payment has been successfully received and your enrollment is confirmed.
        </p>
        <p className="mt-3 text-muted-foreground">
          Please wait for the assigned instructor to contact you directly to arrange your schedule
          and agree on suitable dates and times for your subjects.
        </p>
        <p className="mt-3 font-medium text-foreground">Welcome to Aviator Pass.</p>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          { ok: paid, label: "Enrollment successful" },
          {
            ok: Boolean(data?.accountCreated || data?.attachedToExisting),
            label: data?.attachedToExisting ? "Account linked" : "Account created",
          },
          { ok: Boolean(data?.courseAssigned), label: "Course activated" },
          { ok: Boolean(data?.emailSent), label: "Email sent" },
        ].map((row) => (
          <li
            key={row.label}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
          >
            <CheckCircle2
              className={`size-4 ${row.ok ? "text-accent" : "text-muted-foreground"}`}
            />
            {row.label}
          </li>
        ))}
      </ul>

      <p className="mt-6 break-words text-center text-sm text-muted-foreground">
        {data?.productName} · {data?.amountLabel} · Order {data?.orderNumber}
        {data?.billingEmail ? (
          <>
            {" · "}
            <span className="break-email">{data.billingEmail}</span>
          </>
        ) : null}
      </p>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button variant="accent" className="w-full sm:w-auto" asChild>
          <Link href={routes.studentDashboard}>
            <LayoutDashboard className="mr-2 size-4" />
            Continue to Dashboard
          </Link>
        </Button>
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/student/courses">
            <BookOpen className="mr-2 size-4" />
            Access Course
          </Link>
        </Button>
        {data?.invoicePrintUrl ? (
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <a href={data.invoicePrintUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 size-4" />
              Download Invoice
            </a>
          </Button>
        ) : data?.receiptUrl ? (
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <a href={data.receiptUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 size-4" />
              Download Invoice
            </a>
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full sm:w-auto" asChild>
          <a href={`mailto:${data?.supportEmail || siteStatic.supportEmail}`}>
            <LifeBuoy className="mr-2 size-4" />
            Support
          </a>
        </Button>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Mail className="mr-1 inline size-4" />
        Prefer to set a password from email? Open the setup link we sent, or{" "}
        <Link href={routes.login} className="text-primary hover:underline">
          sign in
        </Link>
        .
      </p>
    </div>
  );
}

export { WelcomeView };
