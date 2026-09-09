import Link from "@/components/ui/app-link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { cn } from "@/lib/utils";
import { AtplCourseFaq } from "@/features/marketing/components/atpl-course-faq";
import { AtplStickyEnrol } from "@/features/marketing/components/atpl-sticky-enrol";
import { AtplSubjectGrid } from "@/features/marketing/components/atpl-subject-grid";
import {
  ATPL_LANDING_HERO,
  COURSE_BENEFITS,
  COURSE_OVERVIEW,
  PRICING,
} from "@/features/marketing/content/atpl-course-landing";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

type AtplProgramPageProps = {
  enrollHref: string;
  priceLabel: string | null;
  subjects: AtplLandingSubjectPublic[];
};

function EnrolButton({
  enrollHref,
  className,
  size = "lg",
}: {
  enrollHref: string;
  className?: string;
  size?: "lg" | "sm";
}) {
  return (
    <Button size={size} variant="accent" className={cn("w-full sm:w-auto", className)} asChild>
      <Link href={enrollHref}>
        Enrol in Aviator Pass
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

function AtplProgramPageContent({ enrollHref, priceLabel, subjects }: AtplProgramPageProps) {
  const subjectCount = subjects.length;
  const subjectLabel = subjectCount === 1 ? "ATPL Subject" : "ATPL Subjects";
  const overviewStats = [
    { value: String(subjectCount || "—"), label: subjectLabel },
    ...COURSE_OVERVIEW.stats.slice(1),
  ];

  return (
    <>
      <section className="atpl-program-hero relative isolate overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "url(/images/marketing/hero-aircraft.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[var(--landing-ink)]/80 via-[var(--landing-ink)]/90 to-[var(--landing-ink)]"
          aria-hidden
        />
        <div className="container-app relative z-10 py-16 sm:py-20 lg:py-24">
          <p className="atpl-kicker atpl-kicker-hero">{ATPL_LANDING_HERO.kicker}</p>
          <h1 className="mt-6 max-w-[18ch] font-display text-[clamp(2.2rem,5vw,3.75rem)] font-bold leading-[1.06] tracking-[-0.035em] text-white">
            {ATPL_LANDING_HERO.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/68 sm:text-lg">
            {ATPL_LANDING_HERO.subheadline}
          </p>
          <ul className="mt-8 flex flex-col gap-2 text-sm text-white/75 sm:text-base">
            {ATPL_LANDING_HERO.proof.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <EnrolButton enrollHref={enrollHref} className="hero-cta-primary px-10" />
            <Button
              size="lg"
              variant="outline"
              className="w-full border-white/20 bg-white/5 px-8 text-white hover:bg-white/10 hover:text-white sm:w-auto"
              asChild
            >
              <Link href="#subjects">{ATPL_LANDING_HERO.secondaryCta}</Link>
            </Button>
            {priceLabel ? (
              <p className="text-sm font-medium text-white/70">
                From <span className="text-accent">{priceLabel}</span>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-light" aria-labelledby="overview-heading">
        <div className="container-app">
          <p className="atpl-kicker">{COURSE_OVERVIEW.kicker}</p>
          <h2 id="overview-heading" className="atpl-heading mt-4 max-w-[20ch]">
            {COURSE_OVERVIEW.title}
          </h2>
          <p className="mt-5 max-w-2xl text-muted-foreground">{COURSE_OVERVIEW.body}</p>
          <div className="mt-10 grid max-w-xl grid-cols-2 gap-4">
            {overviewStats.map((stat) => (
              <div key={stat.label} className="atpl-stat-card">
                <p className="font-display text-3xl font-semibold text-[var(--landing-ink-soft)]">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="subjects"
        className="atpl-section atpl-section-light scroll-mt-28"
        aria-labelledby="subjects-heading"
      >
        <div className="container-app">
          <p className="atpl-kicker">Courses / Subjects</p>
          <h2 id="subjects-heading" className="atpl-heading mt-4 max-w-[22ch]">
            Every theory paper in one enrolment
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {subjectCount} Theory Subjects for the Airline Transport Pilot License. Included with
            the ATPL Course — no separate purchases.
          </p>
          <AtplSubjectGrid subjects={subjects} />
          <div className="mt-12">
            <EnrolButton enrollHref={enrollHref} className="hero-cta-primary px-10" />
          </div>
        </div>
      </section>

      <section
        id="features"
        className="atpl-section atpl-section-accent scroll-mt-28"
        aria-labelledby="features-heading"
      >
        <div className="container-app">
          <p className="atpl-kicker">{COURSE_BENEFITS.kicker}</p>
          <h2 id="features-heading" className="atpl-heading mt-4 max-w-[18ch]">
            {COURSE_BENEFITS.title}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COURSE_BENEFITS.items.map((item) => (
              <article key={item.title} className="atpl-platform-card">
                <CheckCircle2 className="size-5 text-accent" aria-hidden />
                <h3 className="mt-4 font-display text-base font-semibold text-[var(--landing-ink-soft)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="atpl-section atpl-section-light scroll-mt-28"
        aria-labelledby="pricing-heading"
      >
        <div className="container-app">
          <p className="atpl-kicker">{PRICING.kicker}</p>
          <h2 id="pricing-heading" className="atpl-heading mt-4 max-w-[16ch]">
            {PRICING.title}
          </h2>
          <div className="atpl-pricing-card mx-auto mt-10 max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
              {PRICING.name}
            </p>
            <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-[var(--landing-ink-soft)]">
              {priceLabel ?? "Stripe Checkout"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PRICING.blurb}</p>
            <ul className="mt-8 space-y-3">
              {PRICING.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {bullet}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <EnrolButton
                enrollHref={enrollHref}
                className="hero-cta-primary w-full px-10 sm:w-auto"
              />
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{PRICING.note}</p>
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-light" aria-labelledby="faq-heading">
        <div className="container-app max-w-3xl">
          <p className="atpl-kicker">Frequently asked questions</p>
          <h2 id="faq-heading" className="atpl-heading mt-4">
            Before you enrol
          </h2>
          <div className="mt-8">
            <AtplCourseFaq />
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-final" id="enrol">
        <div className="container-app text-center">
          <h2 className="atpl-heading-light mx-auto max-w-[18ch]">
            Ready to enrol in Aviator Pass?
          </h2>
          <p className="mx-auto mt-5 max-w-md text-white/55">
            Continue to secure checkout. No registration until payment succeeds.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col justify-center gap-3 sm:mx-auto sm:max-w-none sm:flex-row sm:flex-wrap">
            <EnrolButton enrollHref={enrollHref} className="hero-cta-primary px-10" />
            <Button
              size="lg"
              variant="outline"
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
              asChild
            >
              <Link href={routes.home}>Back to Home</Link>
            </Button>
          </div>
        </div>
      </section>

      <AtplStickyEnrol enrollHref={enrollHref} priceLabel={priceLabel} />
    </>
  );
}

export { AtplProgramPageContent };
