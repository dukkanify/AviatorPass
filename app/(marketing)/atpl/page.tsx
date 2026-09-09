import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { AtplProgramPageContent } from "@/features/marketing/components/atpl-program-page";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { ATPL_FAQS } from "@/features/marketing/content/atpl-course-landing";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { listPublicAtplSubjects } from "@/services/marketing/atpl-subjects-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ATPL Course",
  description:
    "Enrol in the Aviator Pass ATPL Course — official ATPL syllabus, live instructor-led training, and purchase-first checkout. Sessions are LIVE. Recordings are not available to students.",
  alternates: { canonical: routes.atpl },
  openGraph: {
    title: "ATPL Course | Aviator Pass",
    description:
      "Complete ATPL preparation in one programme — live training, official ATPL syllabus, pay first, account after payment.",
    url: routes.atpl,
  },
};

export default function AtplCoursePage() {
  const { enrollHref, priceLabel } = getAtplProgramMarketing();
  const subjects = listPublicAtplSubjects();

  return (
    <div className="landing-root home-premium atpl-landing-page">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Course",
              name: "ATPL Course",
              description:
                "Complete Airline Transport Pilot License theory programme with live instructor-led training across the official ATPL syllabus.",
              provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
              url: `${siteConfig.url}${routes.atpl}`,
              courseMode: "Live Online",
              inLanguage: "en",
              hasCourseInstance: subjects.map((s) => ({
                "@type": "CourseInstance",
                name: s.title,
                courseCode: s.code || undefined,
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

      <AtplProgramPageContent enrollHref={enrollHref} priceLabel={priceLabel} subjects={subjects} />
    </div>
  );
}
