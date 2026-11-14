import Link from "@/components/ui/app-link";
import {
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Headphones,
  Layers3,
  MonitorPlay,
  Radio,
  Shield,
  UserPlus,
  Users,
  Video,
  Zap,
} from "lucide-react";

import { HomeHeroSlider } from "@/components/media/home-hero-slider";
import { Button } from "@/components/ui/button";
import type { HomeSliderSlide } from "@/types/home-slider";
import {
  HERO,
  HOW_IT_WORKS,
  PROGRAM,
  WHY_CHOOSE,
} from "@/features/marketing/content/atpl-pass-home";
import { MarketingSectionKicker } from "@/features/marketing/components/marketing-section-kicker";
import { routes } from "@/constants/routes";
import { getHomeSiteCopy } from "@/services/marketing/site-copy-service";

const HOW_IT_WORKS_ICONS = [UserPlus, BookOpen, CalendarCheck, Video] as const;

const FEATURE_ICONS = [
  Video,
  Users,
  MonitorPlay,
  Zap,
  Layers3,
  Shield,
  BarChart3,
  Award,
  Radio,
  Headphones,
] as const;

type AtplPassHomepageProps = {
  heroSlides?: HomeSliderSlide[];
  heroIntervalMs?: number;
};

function AtplPassHomepage({ heroSlides = [], heroIntervalMs = 6000 }: AtplPassHomepageProps) {
  const copy = getHomeSiteCopy();
  const hero = { ...HERO, ...copy.hero };
  const howItWorks = {
    kicker: copy.howItWorks.kicker || HOW_IT_WORKS.kicker,
    title: copy.howItWorks.title || HOW_IT_WORKS.title,
    subtitle: copy.howItWorks.subtitle || HOW_IT_WORKS.subtitle,
    steps: copy.howItWorks.steps.map((step, i) => ({
      title: step.title || HOW_IT_WORKS.steps[i]?.title || "",
      body: step.body || HOW_IT_WORKS.steps[i]?.body || "",
    })),
  };

  return (
    <>
      {/* —— Hero —— */}
      <section className="atpl-hero relative isolate -mt-[4.75rem] min-h-[100svh] overflow-hidden pt-[4.75rem]">
        <div className="atpl-hero-bg absolute inset-0">
          <HomeHeroSlider slides={heroSlides} intervalMs={heroIntervalMs} />
        </div>
        <div className="atpl-hero-overlay absolute inset-0" aria-hidden />
        <div className="atpl-hero-glow absolute inset-0" aria-hidden />

        <div className="container-app relative z-10 flex min-h-[calc(100svh-4.75rem)] flex-col justify-center pb-20 pt-16 sm:pb-28">
          <p className="animate-in-up atpl-hero-brand" aria-hidden>
            <span className="text-white">AVIATOR</span>
            <span className="atpl-hero-brand-pass"> PASS</span>
          </p>

          {hero.kicker ? (
            <p className="animate-in-up atpl-kicker atpl-kicker-hero mt-8">{hero.kicker}</p>
          ) : null}

          <h1 className="animate-in-up-delay-1 mt-5 max-w-[18ch] font-display text-[clamp(1.85rem,4.2vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-white/96">
            {hero.headline}
          </h1>

          <p className="animate-in-up-delay-2 mt-7 max-w-2xl text-[1.05rem] leading-relaxed text-white/82 sm:text-lg">
            {hero.subheadline}
          </p>

          <p className="animate-in-up-delay-2 mt-4 max-w-xl text-sm leading-relaxed text-white/65">
            {HERO.audience}
          </p>

          <div className="animate-in-up-delay-3 mt-12 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              size="lg"
              variant="accent"
              className="hero-cta-primary w-full px-9 sm:w-auto"
              asChild
            >
              <Link href={routes.onlineCourses}>
                {hero.primaryCta}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="hero-cta-secondary w-full border-white/25 bg-white/[0.06] px-8 text-white hover:bg-white/12 hover:text-white sm:w-auto"
              asChild
            >
              <Link href={routes.atpl}>{hero.secondaryCta}</Link>
            </Button>
          </div>

          <div className="animate-in-up-delay-3 mt-14 flex flex-wrap gap-3">
            {PROGRAM.badges.map((badge) => (
              <span key={badge} className="atpl-badge">
                {badge}
              </span>
            ))}
          </div>
        </div>

        <a href="#how-it-works" className="home-hero-descend">
          <span className="home-hero-descend-mark" aria-hidden />
          Discover Aviator Pass
        </a>
      </section>

      {/* —— How It Works —— */}
      <section id="how-it-works" className="atpl-section atpl-section-light scroll-mt-28">
        <div className="container-app">
          <MarketingSectionKicker>{howItWorks.kicker}</MarketingSectionKicker>
          <h2 className="atpl-heading mt-4 max-w-[14ch]">{howItWorks.title}</h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {howItWorks.subtitle}
          </p>
          <ol className="atpl-how-grid mt-12">
            {howItWorks.steps.map((step, index) => {
              const Icon = HOW_IT_WORKS_ICONS[index]!;
              const number = String(index + 1).padStart(2, "0");
              return (
                <li key={`${number}-${step.title}`} className="atpl-how-step">
                  <div className="atpl-how-step-top">
                    <span className="atpl-how-icon" aria-hidden>
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
                    </span>
                    <span className="atpl-how-number" aria-hidden>
                      {number}
                    </span>
                  </div>
                  <h3 className="atpl-how-title">{step.title}</h3>
                  <p className="atpl-how-body">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* —— Why Choose —— */}
      <section className="atpl-section atpl-section-dark">
        <div className="container-app">
          <MarketingSectionKicker>{WHY_CHOOSE.kicker}</MarketingSectionKicker>
          <h2 className="atpl-heading-light mt-4 max-w-[16ch]">{WHY_CHOOSE.title}</h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {WHY_CHOOSE.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]!;
              return (
                <article
                  key={f.title}
                  className="atpl-feature-card atpl-reveal"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="atpl-feature-icon">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 font-display text-base font-semibold text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/58">{f.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

export { AtplPassHomepage };
