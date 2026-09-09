"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Award, CheckCircle2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PublicVerificationResult } from "@/types/certificates";

const STATUS_COPY: Record<
  PublicVerificationResult["validity"],
  { title: string; body: string; tone: "valid" | "warn" | "invalid" }
> = {
  valid: {
    title: "Certificate verified",
    body: "This certificate is authentic and currently valid.",
    tone: "valid",
  },
  pending: {
    title: "Pending review",
    body: "This record exists but has not been issued yet.",
    tone: "warn",
  },
  expired: {
    title: "Certificate expired",
    body: "This certificate was issued but is no longer valid.",
    tone: "warn",
  },
  revoked: {
    title: "Certificate revoked",
    body: "This certificate is no longer recognised by Aviator Pass.",
    tone: "invalid",
  },
  not_found: {
    title: "Not found",
    body: "No matching certificate was found for this code.",
    tone: "invalid",
  },
};

function StatusIcon({ tone }: { tone: "valid" | "warn" | "invalid" }) {
  if (tone === "valid") return <CheckCircle2 className="size-8 text-emerald-600" aria-hidden />;
  if (tone === "warn") return <ShieldQuestion className="size-8 text-amber-600" aria-hidden />;
  return <ShieldAlert className="size-8 text-destructive" aria-hidden />;
}

function PublicCertificateVerifyView() {
  const search = useSearchParams();
  const initial = search.get("code") || search.get("number") || "";
  const [code, setCode] = React.useState(initial);
  const [result, setResult] = React.useState<PublicVerificationResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const verify = React.useCallback(async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/certificates/verify?code=${encodeURIComponent(value.trim())}`);
    const json = (await res.json()) as {
      success: boolean;
      data: PublicVerificationResult | null;
    };
    setResult(json.data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (initial) void verify(initial);
  }, [initial, verify]);

  const status = result ? STATUS_COPY[result.validity] : null;

  return (
    <div className="flex min-h-[80vh] items-center justify-center bg-[linear-gradient(180deg,#f4f6f8_0%,#edf1f4_100%)] px-4 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <ShieldCheck className="mx-auto mb-4 size-11 text-[var(--landing-ink-soft,#143048)]" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--landing-ink-soft,#143048)] sm:text-4xl">
            Verify a certificate
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enter a certificate number or verification code, or scan the QR code printed on the
            document.
          </p>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-[0_18px_50px_-28px_rgba(20,48,72,0.45)] sm:p-8">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void verify(code);
            }}
          >
            <Input
              aria-label="Certificate number or verification code"
              placeholder="Certificate number or verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button type="submit" className="h-12 rounded-xl px-6" disabled={loading}>
              {loading ? "Checking…" : "Verify"}
            </Button>
          </form>

          {status && result ? (
            <div
              className={cn(
                "mt-8 rounded-2xl border p-5 sm:p-6",
                status.tone === "valid" && "border-emerald-200 bg-emerald-50/70",
                status.tone === "warn" && "border-amber-200 bg-amber-50/80",
                status.tone === "invalid" && "border-destructive/20 bg-destructive/5",
              )}
              role="status"
            >
              <div className="flex items-start gap-4">
                <StatusIcon tone={status.tone} />
                <div>
                  <p className="font-display text-xl font-semibold text-[var(--landing-ink-soft,#143048)]">
                    {status.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{status.body}</p>
                </div>
              </div>

              {result.validity !== "not_found" ? (
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Student
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{result.studentName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Course
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{result.courseName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Issued
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{result.issueDate ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Number
                    </dt>
                    <dd className="mt-1 font-mono text-sm">{result.certificateNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Instructor
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{result.instructorName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Organization
                    </dt>
                    <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                      <Award className="size-4 text-accent" aria-hidden />
                      {result.organizationName}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { PublicCertificateVerifyView };
