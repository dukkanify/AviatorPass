"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/app-link";
import { routes } from "@/constants/routes";

/**
 * Unknown page URLs bounce to the platform home.
 * Unknown /api/* paths must stay on the API — never client-navigate to "/".
 */
export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();
  const isApi = Boolean(pathname?.startsWith("/api/"));

  React.useEffect(() => {
    if (isApi) return;
    router.replace(routes.home);
  }, [router, isApi]);

  if (isApi) {
    return (
      <pre className="min-h-dvh bg-[var(--surface-ink,#0f2a3d)] p-6 font-mono text-sm text-white">
        {JSON.stringify({ error: "Not found" })}
      </pre>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--surface-ink,#0f2a3d)] px-4 text-white">
      <BrandLogo variant="dark" href={routes.home} className="[&_img]:h-12 [&_img]:max-w-[320px]" />
      <p className="mt-8 text-sm font-medium uppercase tracking-[0.2em] text-white/55">
        Opening Aviator Pass
      </p>
      <p className="mt-3 max-w-md text-center text-base text-white/70">
        Taking you to the platform home — Online Courses, ATPL, and academy support are all one
        click away.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="accent" className="hero-cta-primary" asChild>
          <Link href={routes.home}>Go to platform</Link>
        </Button>
        <Button
          variant="outline"
          className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          asChild
        >
          <Link href={routes.onlineCourses}>Browse courses</Link>
        </Button>
      </div>
    </div>
  );
}
