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
      <div className="container-app flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            ATPL PASS
          </p>
          <p className="truncate text-sm text-white/75">
            {priceLabel ? `From ${priceLabel} · ` : ""}Pay first — account created after payment
          </p>
        </div>
        <Button size="sm" variant="accent" className="hero-cta-primary shrink-0 px-5" asChild>
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
