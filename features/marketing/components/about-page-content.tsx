import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Eye,
  Flag,
  GraduationCap,
  History,
  MonitorPlay,
  Route,
  Scale,
  Shield,
  Video,
} from "lucide-react";

import { PartnerStrip } from "@/features/marketing/components/partner-strip";
import { MarketingSectionKicker } from "@/features/marketing/components/marketing-section-kicker";
import { ABOUT, PLATFORM_FEATURES } from "@/features/marketing/content/atpl-pass-home";
import { getHomeSiteCopy } from "@/services/marketing/site-copy-service";

const VALUE_ICONS = [Shield, GraduationCap, Route, Scale] as const;

const STORY_TILES = [
  { key: "mission", title: "Our Mission", Icon: Flag },
  { key: "vision", title: "Our Vision", Icon: Eye },
  { key: "history", title: "Our History", Icon: History },
] as const;

const PLATFORM_ICONS = [
  Video,
  MonitorPlay,
  BarChart3,
  Award,
  GraduationCap,
  BookOpen,
  BookOpen,
  Shield,
  MonitorPlay,
] as const;

function AboutPageContent() {
  const copy = getHomeSiteCopy();
  const about = {
    title: copy.about.title || ABOUT.title,
    whoWeAre: copy.about.whoWeAre || ABOUT.whoWeAre,
    mission: copy.about.mission || ABOUT.mission,
    vision: copy.about.vision || ABOUT.vision,
    history: copy.about.history || ABOUT.history,
    values: copy.about.values.map((v, i) => ({
      title: v.title || ABOUT.values[i]?.title || "",
      body: v.body || ABOUT.values[i]?.body || "",
    })),
    whyChoose: copy.about.whyChoose.map((item, i) => item || ABOUT.whyChoose[i] || ""),
  };

  const storyBodies = {
    mission: about.mission,
    vision: about.vision,
    history: about.history,
  } as const;

  return (
    <>
      <section className="atpl-about-hero">
        <div className="container-app">
          <MarketingSectionKicker>About</MarketingSectionKicker>
          <h1 className="atpl-heading-light mt-5 max-w-[16ch]">{about.title}</h1>
          <div className="atpl-about-hero-rule" aria-hidden />
        </div>
      </section>

      <section
        id="about"
        className="atpl-section atpl-section-light atpl-section-about scroll-mt-28"
      >
        <div className="container-app atpl-about-stack">
          <article className="atpl-about-intro">
            <div className="atpl-about-intro-aside">
              <p className="atpl-about-intro-label">Who We Are</p>
              <h2 className="atpl-about-intro-title">Built for every stage of the pilot journey</h2>
            </div>
            <div className="atpl-about-intro-copy">
              <p>{about.whoWeAre}</p>
            </div>
          </article>

          <div className="atpl-about-story">
            {STORY_TILES.map(({ key, title, Icon }, i) => (
              <article key={key} className="atpl-about-story-item">
                <div className="atpl-about-story-meta">
                  <span className="atpl-about-story-index">{String(i + 1).padStart(2, "0")}</span>
                  <span className="atpl-about-story-icon" aria-hidden>
                    <Icon />
                  </span>
                </div>
                <h2 className="atpl-about-story-title">{title}</h2>
                <p className="atpl-about-story-body">{storyBodies[key]}</p>
              </article>
            ))}
          </div>

          <div className="atpl-about-block">
            <div className="atpl-about-block-head">
              <MarketingSectionKicker>Our Values</MarketingSectionKicker>
              <h2 className="atpl-heading mt-4 max-w-[18ch]">
                Principles that guide every programme
              </h2>
            </div>
            <div className="atpl-about-values">
              {about.values.map((v, i) => {
                const Icon = VALUE_ICONS[i % VALUE_ICONS.length]!;
                return (
                  <article key={v.title} className="atpl-about-value">
                    <span className="atpl-about-value-index" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="atpl-about-value-icon" aria-hidden>
                      <Icon />
                    </span>
                    <h3 className="atpl-about-value-title">{v.title}</h3>
                    <p className="atpl-about-value-body">{v.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="atpl-about-why-section">
        <div className="container-app atpl-about-why">
          <div className="atpl-about-why-copy">
            <MarketingSectionKicker>Why Students Choose Us</MarketingSectionKicker>
            <h2 className="atpl-heading-light mt-4 max-w-[14ch]">
              Clear reasons to train with Aviator Pass
            </h2>
          </div>
          <ul className="atpl-about-why-list">
            {about.whyChoose.map((item) => (
              <li key={item}>
                <CheckCircle2 aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="atpl-section atpl-section-light">
        <div className="container-app">
          <MarketingSectionKicker>{PLATFORM_FEATURES.kicker}</MarketingSectionKicker>
          <h2 className="atpl-heading mt-4 max-w-[20ch]">{PLATFORM_FEATURES.title}</h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_FEATURES.items.map((item, i) => {
              const Icon = PLATFORM_ICONS[i % PLATFORM_ICONS.length]!;
              return (
                <article key={item.title} className="atpl-platform-card">
                  <Icon className="h-6 w-6 text-accent" aria-hidden />
                  <h3 className="mt-4 font-display text-lg font-semibold text-[var(--landing-ink-soft)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <PartnerStrip size="large" />
    </>
  );
}

export { AboutPageContent };
