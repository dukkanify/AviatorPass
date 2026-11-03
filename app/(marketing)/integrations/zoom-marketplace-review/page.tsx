import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import {
  FINAL_REVIEW_PATH,
  FINAL_REVIEW_SECTIONS,
  FINAL_REVIEW_TITLE,
  FINAL_REVIEW_UPDATED,
} from "@/features/zoom/content/marketplace-final-review";

const description =
  "English Zoom Marketplace final review test plan for AviatorPass Classroom for Zoom and AviatorPass for Zoom. No passwords.";

export const metadata: Metadata = {
  title: FINAL_REVIEW_TITLE,
  description,
  alternates: { canonical: FINAL_REVIEW_PATH },
  openGraph: {
    title: `${FINAL_REVIEW_TITLE} | ${siteStatic.name}`,
    description,
    url: FINAL_REVIEW_PATH,
  },
};

export default function ZoomMarketplaceFinalReviewPage() {
  const url = `${siteConfig.url}${FINAL_REVIEW_PATH}`;

  return (
    <div className="landing-root">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${FINAL_REVIEW_TITLE} | ${siteStatic.name}`,
          url,
          description,
          dateModified: "2026-10-22",
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
        }}
      />

      <section className="catalog-page-hero hero-aviation relative isolate overflow-hidden">
        <div className="hero-horizon" aria-hidden />
        <div className="hero-vignette" aria-hidden />
        <div className="container-app relative z-10 py-16 sm:py-20 lg:py-24">
          <p className="landing-kicker text-accent">Zoom Marketplace</p>
          <h1 className="hero-brand mt-5 max-w-[18ch] font-display text-[clamp(2.2rem,6vw,4.2rem)] font-semibold">
            Final Review Test Plan
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {description} Updated {FINAL_REVIEW_UPDATED}.
          </p>
        </div>
      </section>

      <section className="platform-surface py-14 sm:py-20">
        <div className="container-app mx-auto max-w-3xl space-y-10">
          {FINAL_REVIEW_SECTIONS.map((section) => (
            <article
              key={section.heading}
              id={section.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
              className="space-y-3"
            >
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-[15px] leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}

          <p className="border-t border-border/60 pt-8 text-sm text-muted-foreground">
            Support:{" "}
            <a
              className="font-medium text-primary underline-offset-2 hover:underline"
              href={`mailto:${siteStatic.supportEmail}`}
            >
              {siteStatic.supportEmail}
            </a>
            . Do not submit either Marketplace application until the account owner approves.
          </p>
        </div>
      </section>
    </div>
  );
}
