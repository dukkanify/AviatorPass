"use client";

import Link from "@/components/ui/app-link";
import { ArrowUpRight } from "lucide-react";

import { ATPL_COMPLETE_PACKAGE_NAME } from "@/constants/atpl-complete-package";
import { ACTION_LABELS } from "@/constants/programme-terms";
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {ATPL_COMPLETE_PACKAGE_NAME}
          </p>
          <p className="break-words text-sm leading-snug text-white/75">
            {priceLabel ? `From ${priceLabel} · ` : ""}13 subjects · pay first — account after
            payment
          </p>
        </div>
        <Button
          size="sm"
          variant="accent"
          className="hero-cta-primary min-h-11 w-full shrink-0 px-5 sm:w-auto"
          asChild
        >
          <Link href={enrollHref}>
            {ACTION_LABELS.chooseThisPackage}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export { AtplStickyEnrol };
