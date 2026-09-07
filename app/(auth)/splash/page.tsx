import Link from "@/components/ui/app-link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { brandingConfig } from "@/config/branding";
import { routes } from "@/constants/routes";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: "Welcome",
  description: siteConfig.description,
};

export default function SplashPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4">
      <div className="hero-aviation absolute inset-0" />
      <div className="hero-read-overlay" />
      <div className="hero-read-vignette" />
      <div className="hero-read-glass relative z-10 mx-auto flex max-w-lg flex-col items-center text-center">
        <BrandLogo variant="dark" href={null} priority className="mb-6" />
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
          {brandingConfig.tagline}
        </p>
        <h1 className="hero-read-heading font-display text-5xl tracking-tight sm:text-6xl">
          <span>Aviator</span> <span className="text-accent">Pass</span>
        </h1>
        <p className="hero-read-sub mt-5 text-base">{siteConfig.description}</p>
        <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="accent" size="lg" asChild>
            <Link href={routes.login}>Sign in</Link>
          </Button>
          <Button size="lg" variant="outline" className="hero-read-cta-dark" asChild>
            <Link href={routes.onlineCourses}>Explore Online Courses</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
