import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { AtplPassHomepage } from "@/features/marketing/components/atpl-pass-homepage";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { ATPL_SUBJECTS_13 } from "@/features/marketing/content/atpl-course-landing";
import { APP_METADATA } from "@/constants/navigation";

/** Cache public marketing HTML briefly — catalog IDs are stable enough for short ISR. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: {
    absolute: APP_METADATA.title.default,
  },
  description: APP_METADATA.description,
  keywords: [
    "Aviator Pass",
    "aviation education",
    "EASA Certified Instructors",
    "ATPL Course",
    "Private Pilot License",
    "Basics of Aviation",
    "ELP mock exams",
    "Dubai",
    "Copenhagen",
    "Kuwait",
    "Qatar",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: APP_METADATA.title.default,
    description: APP_METADATA.description,
    url: "/",
    type: "website",
    images: [{ url: siteConfig.brand.openGraph, width: 1200, height: 630, alt: "Aviator Pass" }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_METADATA.title.default,
    description: APP_METADATA.description,
    images: [siteConfig.brand.openGraph],
  },
};

export default function HomePage() {
  const subjects = ATPL_SUBJECTS_13.map((s) => ({
    code: s.code,
    title: s.title,
    shortDescription: s.shortDescription,
  }));

  return (
    <div className="landing-root home-premium">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${siteConfig.url}/#organization`,
              name: siteConfig.name,
              url: siteConfig.url,
              logo: `${siteConfig.url}${siteConfig.brand.logo}`,
              email: siteConfig.contactEmail,
              areaServed: siteConfig.locations.map((name) => ({ "@type": "Place", name })),
            },
            {
              "@type": "WebSite",
              "@id": `${siteConfig.url}/#website`,
              url: siteConfig.url,
              name: siteConfig.name,
              description: siteConfig.description,
              publisher: { "@id": `${siteConfig.url}/#organization` },
              inLanguage: "en",
            },
            {
              "@type": "Course",
              name: "ATPL Course",
              description:
                "Complete Airline Transport Pilot License preparation with live instructor-led training across 13 ATPL Subjects.",
              provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
              url: `${siteConfig.url}${routes.atpl}`,
              educationalLevel: "Professional",
              courseMode: "Live Online",
              inLanguage: "en",
              offers: {
                "@type": "Offer",
                availability: "https://schema.org/InStock",
                category: "ATPL Training Program",
              },
            },
          ],
        }}
      />

      <AtplPassHomepage subjects={subjects} courseHref={routes.atpl} />
    </div>
  );
}
