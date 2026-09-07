"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ensureBrowserCsrf, csrfHeaders } from "@/features/auth/services/auth-api";
import { cn } from "@/lib/utils";

type EnrolNowButtonProps = {
  courseId: string;
  currency?: string | null;
  className?: string;
  label?: string;
};

function EnrolNowButton({
  courseId,
  currency,
  className,
  label = "Enrol now",
}: EnrolNowButtonProps) {
  const [loading, setLoading] = React.useState(false);

  async function startCheckout() {
    setLoading(true);
    try {
      await ensureBrowserCsrf();
      const res = await fetch("/api/payments/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          courseId,
          ...(currency ? { currency } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { url?: string };
        error?: string | { message?: string } | null;
      } | null;
      const url = json?.data?.url;
      if (!res.ok || !url) {
        const message =
          typeof json?.error === "string"
            ? json.error
            : json?.error && typeof json.error === "object"
              ? json.error.message
              : "Unable to start checkout";
        toast.error(message || "Unable to start checkout");
        return;
      }
      window.location.href = url;
    } catch {
      toast.error("Unable to start checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="accent"
      className={cn("w-full sm:w-auto", className)}
      aria-label={label}
      loading={loading}
      onClick={() => void startCheckout()}
    >
      {label}
      <ArrowUpRight className="h-4 w-4" />
    </Button>
  );
}

export { EnrolNowButton };
