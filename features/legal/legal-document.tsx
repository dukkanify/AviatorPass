import Link from "@/components/ui/app-link";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";
import { LEGAL_UPDATED_LABEL, type LegalSection } from "@/features/legal/content";

function LegalDocument({
  title,
  description,
  path,
  sections,
}: {
  title: string;
  description: string;
  path: string;
  sections: LegalSection[];
}) {
  const url = `${siteConfig.url}${path}`;

  return (
    <div className="landing-root">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${title} | ${siteStatic.name}`,
          url,
          description,
          dateModified: "2026-09-09",
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
        }}
      />

      <section className="catalog-page-hero hero-aviation relative isolate overflow-hidden">
        <div className="hero-horizon" aria-hidden />
        <div className="hero-vignette" aria-hidden />
        <div className="container-app relative z-10 py-16 sm:py-20 lg:py-24">
          <p className="landing-kicker text-accent">Legal</p>
          <h1 className="hero-brand mt-5 max-w-[18ch] font-display text-[clamp(2.2rem,6vw,4.2rem)] font-semibold">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {description}
          </p>
          <p className="mt-4 text-sm text-white/50">Last updated {LEGAL_UPDATED_LABEL}</p>
        </div>
      </section>

      <section className="platform-surface py-14 sm:py-20">
        <div className="container-app mx-auto max-w-3xl space-y-10">
          {sections.map((section) => (
            <article key={section.heading} className="space-y-3">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph, index) => (
                <p
                  key={`${section.heading}-p-${index}`}
                  className="text-[15px] leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
                  {section.bullets.map((item, index) => (
                    <li key={`${section.heading}-b-${index}`}>{item}</li>
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
            {" · "}
            <Link
              href={routes.register}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Back to registration
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export { LegalDocument };
