import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { AtplProgramPageContent } from "@/features/marketing/components/atpl-program-page";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { ATPL_FAQS, ATPL_SUBJECTS_14 } from "@/features/marketing/content/atpl-course-landing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "ATPL Course",
  description:
    "Enrol in ATPL PASS — fourteen ATPL theory subjects, live instructor-led training, and purchase-first checkout. Pay first; your student account is created automatically.",
  alternates: { canonical: routes.atpl },
  openGraph: {
    title: "ATPL Course | ATPL PASS",
    description:
      "Complete ATPL preparation in one programme — live training, all 14 subjects, pay first, account after payment.",
    url: routes.atpl,
  },
};

export default function AtplCoursePage() {
  const { enrollHref, priceLabel } = getAtplProgramMarketing();

  return (
    <div className="landing-root home-premium atpl-landing-page">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Course",
              name: "ATPL PASS",
              description:
                "Complete Airline Transport Pilot License theory programme with live instructor-led training across fourteen ATPL subjects.",
              provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
              url: `${siteConfig.url}${routes.atpl}`,
              courseMode: "Live Online",
              inLanguage: "en",
              hasCourseInstance: ATPL_SUBJECTS_14.map((s) => ({
                "@type": "CourseInstance",
                name: s.title,
                courseCode: s.code,
              })),
            },
            {
              "@type": "FAQPage",
              mainEntity: ATPL_FAQS.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ],
        }}
      />

      <AtplProgramPageContent enrollHref={enrollHref} priceLabel={priceLabel} />
    </div>
  );
}
