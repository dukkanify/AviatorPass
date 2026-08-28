"use client";

import Link from "@/components/ui/app-link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type AtplStickyEnrolProps = {
  enrollHref: string;
  priceLabel: string | null;
};

function AtplStickyEnrol({ enrollHref, priceLabel }: AtplStickyEnrolProps) {
  return (
    <div className="atpl-sticky-enrol">
      <div className="container-app flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">ATPL PASS</p>
          <p className="break-words text-sm leading-snug text-white/75">
            {priceLabel ? `From ${priceLabel} · ` : ""}Pay first — account created after payment
          </p>
        </div>
        <Button
          size="sm"
          variant="accent"
          className="hero-cta-primary min-h-11 w-full shrink-0 px-5 sm:w-auto"
          asChild
        >
          <Link href={enrollHref}>
            Enrol in ATPL PASS
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export { AtplStickyEnrol };
