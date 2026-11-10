import type { Metadata } from "next";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { ACTION_LABELS } from "@/constants/programme-terms";
import { routes } from "@/constants/routes";
import { AtplCourseFaq } from "@/features/marketing/components/atpl-course-faq";
import { ATPL_FAQS } from "@/features/marketing/content/atpl-course-landing";
import { ONLINE_COURSES_FAQ } from "@/features/marketing/content/online-courses";

export const revalidate = 60;

const QA_ITEMS = [
  ...ATPL_FAQS,
  ...ONLINE_COURSES_FAQ.filter((item) => !ATPL_FAQS.some((faq) => faq.q === item.q)),
];

export const metadata: Metadata = {
  title: "Q&A",
  description:
    "Answers about Aviator Pass enrolment, ATPL Complete Package checkout, live training, payments, and student accounts.",
  alternates: { canonical: routes.qa },
  openGraph: {
    title: `Q&A | ${siteConfig.name}`,
    description:
      "Frequently asked questions before you enrol in Aviator Pass Online Courses and the ATPL Complete Package.",
    url: routes.qa,
  },
};

export default function QaPage() {
  return (
    <div className="landing-root home-premium">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: QA_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />

      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app max-w-3xl">
          <p className="atpl-kicker">Frequently asked questions</p>
          <h1 className="atpl-heading-light mt-4">Q&A</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            Before you enrol, review the most common questions about payment, accounts, live ATPL
            training, and how Aviator Pass works.
          </p>
        </div>
      </section>

      <section className="atpl-section atpl-section-light" aria-labelledby="qa-heading">
        <div className="container-app max-w-3xl">
          <h2 id="qa-heading" className="atpl-heading">
            Before you enrol
          </h2>
          <div className="mt-8">
            <AtplCourseFaq items={QA_ITEMS} />
          </div>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild className="hero-cta-primary">
              <Link href={routes.atpl}>{ACTION_LABELS.viewAtplCourse}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.contact}>Contact an advisor</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
