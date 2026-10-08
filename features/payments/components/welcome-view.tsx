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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { siteStatic } from "@/config/site-static";
import {
  ATPL_INSTRUCTOR_CONFIRM_NOTICE,
  ATPL_PACKAGE_TKI_NOTICE,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
  formatAtplPackageScheduleLabel,
} from "@/constants/atpl-complete-package";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import { setupPasswordSchema } from "@/utils/validation";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
  needsPasswordSetup?: boolean;
  setupPasswordToken?: string | null;
  setupPasswordUrl?: string | null;
  supportEmail: string;
  studyStartDate: string | null;
  firstLectureTime: string | null;
  scheduleNotice: string | null;
  scheduleProvisional?: boolean;
  instructorAssignmentStatus?: "pending" | "assigned";
  instructorAssignmentLabel?: string | null;
};

function WelcomePasswordForm({ email, token }: { email: string; token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = setupPasswordSchema.safeParse({
      email,
      token,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }
    setPending(true);
    try {
      const result = await authFetch<{ email: string }>(routes.api.auth.setupPassword, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      if (!result.success) {
        toast.error(result.error ?? "Unable to set password");
        return;
      }
      toast.success("Password saved. Sign in to open your dashboard.");
      router.replace(`${routes.login}?email=${encodeURIComponent(email)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 text-left"
    >
      <div>
        <p className="text-sm font-semibold text-foreground">Set your password</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a password here so you can sign in even if the confirmation email does not arrive.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="welcome-email">Email</Label>
        <Input id="welcome-email" type="email" value={email} readOnly className="bg-muted/40" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="welcome-password">New password</Label>
        <Input
          id="welcome-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="welcome-confirm-password">Confirm password</Label>
        <Input
          id="welcome-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password and continue"}
      </Button>
    </form>
  );
}

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
        {data?.studyStartDate && data.firstLectureTime ? (
          <p className="mt-3 text-muted-foreground">
            {data.scheduleProvisional === false
              ? "Confirmed first lecture: "
              : "Requested first lecture: "}
            <span className="font-medium text-foreground">
              {formatAtplPackageScheduleLabel(data.studyStartDate, data.firstLectureTime)}
            </span>
          </p>
        ) : null}
        {data?.instructorAssignmentStatus === "pending" ||
        (!data?.instructorAssignmentStatus && data?.studyStartDate) ? (
          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            {data.instructorAssignmentLabel || ATPL_PENDING_INSTRUCTOR_ASSIGNMENT}
          </p>
        ) : data?.instructorAssignmentLabel ? (
          <p className="mt-3 text-sm font-medium text-foreground">
            {data.instructorAssignmentLabel}
          </p>
        ) : null}
        {data?.instructorAssignmentStatus === "pending" ||
        (!data?.instructorAssignmentStatus && data?.studyStartDate) ? (
          <p className="mt-2 text-sm text-muted-foreground">{ATPL_INSTRUCTOR_CONFIRM_NOTICE}</p>
        ) : null}
        <p className="mt-3 text-muted-foreground">
          {data?.scheduleNotice || ATPL_PACKAGE_TKI_NOTICE}
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

      {data?.needsPasswordSetup && data.setupPasswordToken && data.billingEmail ? (
        <WelcomePasswordForm email={data.billingEmail} token={data.setupPasswordToken} />
      ) : null}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Mail className="mr-1 inline size-4" />
        {data?.needsPasswordSetup
          ? "Prefer the email setup link instead? Open it from your inbox, or "
          : "Prefer to set a password from email? Open the setup link we sent, or "}
        <Link
          href={`${routes.login}${data?.billingEmail ? `?email=${encodeURIComponent(data.billingEmail)}` : ""}`}
          className="text-primary hover:underline"
        >
          sign in
        </Link>
        .
      </p>
    </div>
  );
}

export { WelcomeView };
