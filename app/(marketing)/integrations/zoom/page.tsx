import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import {
  MEETING_SDK_APP_NAME,
  MEETING_SDK_DOC_SECTIONS,
  MEETING_SDK_DOCS_PATH,
  MEETING_SDK_INDEPENDENCE,
  MEETING_SDK_SHORT_DESCRIPTION,
} from "@/features/zoom/content/meeting-sdk-public";

const description = MEETING_SDK_SHORT_DESCRIPTION;

export const metadata: Metadata = {
  title: MEETING_SDK_APP_NAME,
  description,
  alternates: { canonical: MEETING_SDK_DOCS_PATH },
  openGraph: {
    title: `${MEETING_SDK_APP_NAME} | ${siteStatic.name}`,
    description,
    url: MEETING_SDK_DOCS_PATH,
  },
};

export default function MeetingSdkDocumentationPage() {
  const url = `${siteConfig.url}${MEETING_SDK_DOCS_PATH}`;

  return (
    <div className="landing-root">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${MEETING_SDK_APP_NAME} | ${siteStatic.name}`,
          url,
          description,
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
        }}
      />

      <section className="catalog-page-hero hero-aviation relative isolate overflow-hidden">
        <div className="hero-horizon" aria-hidden />
        <div className="hero-vignette" aria-hidden />
        <div className="container-app relative z-10 py-16 sm:py-20 lg:py-24">
          <p className="landing-kicker text-accent">Meeting SDK</p>
          <h1 className="hero-brand mt-5 max-w-[16ch] font-display text-[clamp(2.2rem,6vw,4.2rem)] font-semibold">
            {MEETING_SDK_APP_NAME}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {description} {MEETING_SDK_INDEPENDENCE}
          </p>
        </div>
      </section>

      <section className="platform-surface py-14 sm:py-20">
        <div className="container-app mx-auto max-w-3xl space-y-10">
          {MEETING_SDK_DOC_SECTIONS.map((section) => (
            <article
              key={section.heading}
              id={section.heading.toLowerCase().replace(/\s+/g, "-")}
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
            Questions?{" "}
            <a
              className="font-medium text-primary underline-offset-2 hover:underline"
              href={`mailto:${siteStatic.supportEmail}`}
            >
              {siteStatic.supportEmail}
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
