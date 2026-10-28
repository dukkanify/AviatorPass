import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import {
  CLASSROOM_REVIEW_NOTE_MATRIX,
  CLASSROOM_REVIEW_PATH,
  CLASSROOM_REVIEW_SECTIONS,
  CLASSROOM_REVIEW_TITLE,
  CLASSROOM_REVIEW_UPDATED,
} from "@/features/zoom/content/classroom-marketplace-functional-review";

const description =
  "English Zoom Marketplace functional review package for AviatorPass Classroom for Zoom (Meeting SDK). No passwords.";

export const metadata: Metadata = {
  title: CLASSROOM_REVIEW_TITLE,
  description,
  alternates: { canonical: CLASSROOM_REVIEW_PATH },
  openGraph: {
    title: `${CLASSROOM_REVIEW_TITLE} | ${siteStatic.name}`,
    description,
    url: CLASSROOM_REVIEW_PATH,
  },
};

export default function ZoomClassroomMarketplaceReviewPage() {
  const url = `${siteConfig.url}${CLASSROOM_REVIEW_PATH}`;

  return (
    <div className="landing-root">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${CLASSROOM_REVIEW_TITLE} | ${siteStatic.name}`,
          url,
          description,
          dateModified: "2026-10-28",
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
        }}
      />

      <section className="catalog-page-hero hero-aviation relative isolate overflow-hidden">
        <div className="hero-horizon" aria-hidden />
        <div className="hero-vignette" aria-hidden />
        <div className="container-app relative z-10 py-16 sm:py-20 lg:py-24">
          <p className="landing-kicker text-accent">Zoom Marketplace</p>
          <h1 className="hero-brand mt-5 max-w-[20ch] font-display text-[clamp(2.2rem,6vw,4.2rem)] font-semibold">
            Classroom for Zoom
          </h1>
          <p className="mt-6 max-w-2xl text-base text-white/75 sm:text-lg">
            Functional review package for the Meeting SDK application. Updated{" "}
            {CLASSROOM_REVIEW_UPDATED}. Passwords are not published here.
          </p>
        </div>
      </section>

      <section className="container-app space-y-14 py-14 sm:py-16">
        {CLASSROOM_REVIEW_SECTIONS.map((section) => (
          <article key={section.heading} className="max-w-3xl">
            <h2 className="font-display text-2xl font-semibold text-primary sm:text-3xl">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 48)}
                className="mt-4 text-base leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet.slice(0, 64)}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}

        <article className="max-w-3xl">
          <h2 className="font-display text-2xl font-semibold text-primary sm:text-3xl">
            11. October 22 note status matrix
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Zoom Marketplace portal configuration cannot be read from AviatorPass. Items marked
            manual remain owner actions inside Zoom Marketplace. Do not submit until the account
            owner approves.
          </p>
          <ul className="mt-4 space-y-4">
            {CLASSROOM_REVIEW_NOTE_MATRIX.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm leading-relaxed text-muted-foreground"
              >
                <p className="font-semibold text-primary">
                  Note {note.id}: {note.title}
                </p>
                <p className="mt-2">
                  <span className="font-medium text-foreground">Status:</span> {note.status}
                </p>
                <p className="mt-1">{note.manualAction}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
