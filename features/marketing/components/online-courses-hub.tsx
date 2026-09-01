import Link from "@/components/ui/app-link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EasaBadge } from "@/features/marketing/components/easa-badge";
import { AtplCourseFaq } from "@/features/marketing/components/atpl-course-faq";
import {
  ONLINE_COURSE_PROGRAMMES,
  ONLINE_COURSES_FAQ,
  ONLINE_COURSES_HUB,
} from "@/features/marketing/content/online-courses";

function OnlineCoursesHub() {
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app">
          <p className="atpl-kicker">{ONLINE_COURSES_HUB.kicker}</p>
          <h1 className="atpl-heading-light mt-4 max-w-[18ch]">{ONLINE_COURSES_HUB.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            {ONLINE_COURSES_HUB.intro}
          </p>
          <p className="mt-3 text-sm uppercase tracking-[0.16em] text-accent">
            {ONLINE_COURSES_HUB.locationsLabel}
          </p>
          <div className="mt-8">
            <EasaBadge variant="dark" />
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-light">
        <div className="container-app">
          <div className="grid gap-5 md:grid-cols-2">
            {ONLINE_COURSE_PROGRAMMES.map((programme) => (
              <article key={programme.id} className="online-course-card">
                <h2 className="font-display text-2xl font-semibold text-[var(--landing-ink-soft)]">
                  {programme.title}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {programme.modes.map((mode) => (
                    <Link key={mode.href} href={mode.href} className="online-course-mode">
                      {mode.label}
                    </Link>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {programme.summary}
                </p>
                <ul className="mt-4 space-y-2">
                  {programme.points.map((point) => (
                    <li key={point} className="flex gap-2 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="accent" className="hero-cta-primary mt-6 w-full sm:w-auto" asChild>
                  <Link href={programme.href}>
                    {programme.enrollLabel}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-light">
        <div className="container-app">
          <AtplCourseFaq items={[...ONLINE_COURSES_FAQ]} />
        </div>
      </section>
    </div>
  );
}

export { OnlineCoursesHub };
