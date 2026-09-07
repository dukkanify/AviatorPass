import Link from "@/components/ui/app-link";
import type { Metadata } from "next";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Instructor approval pending",
  robots: { index: false, follow: false },
};

export default function InstructorPendingPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="hero-aviation absolute inset-0" />
      <div className="hero-read-overlay" />
      <div className="hero-read-vignette" />
      <div className="hero-read-glass relative z-10 w-full max-w-lg p-8 text-center text-white">
        <div className="mb-6 flex justify-center">
          <BrandLogo variant="dark" href={routes.home} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
          Pending approval
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Your instructor account is under review
        </h1>
        <p className="hero-read-sub mt-4 text-sm">
          An administrator will activate your teaching access. Once approved, you can open the
          instructor control panel, view assigned courses, and manage your students.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="accent" asChild>
            <Link href={routes.login}>Check again later</Link>
          </Button>
          <Button variant="outline" className="hero-read-cta-dark" asChild>
            <Link href={routes.home}>Back to platform</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
