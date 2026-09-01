import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { EasaBadge } from "@/features/marketing/components/easa-badge";
import { BASICS_PAGE } from "@/features/marketing/content/online-courses";
import { getJourneyEnrollMarketing } from "@/lib/marketing/journey-enroll-marketing";

export const revalidate = 60;

type PageProps = { searchParams?: Promise<{ mode?: string }> };

export const metadata: Metadata = {
  title: "Basics of Aviation",
  description:
    "Basics of Aviation on Aviator Pass — recorded or live one-to-one with EASA Certified Instructors.",
  alternates: { canonical: routes.onlineCoursesBasics },
};

export default async function BasicsOfAviationPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const live = params.mode === "live";
  const sku = live ? "BASICS-LIVE" : "BASICS-RECORDED";
  const { enrollHref, priceLabel } = getJourneyEnrollMarketing(sku);

  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app max-w-3xl">
          <p className="atpl-kicker">{BASICS_PAGE.kicker}</p>
          <h1 className="atpl-heading-light mt-4">{BASICS_PAGE.title}</h1>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            {live ? "Live One-to-One" : "Recorded"}
          </p>
          <p className="mt-5 text-base leading-relaxed text-white/70">{BASICS_PAGE.intro}</p>
          <div className="mt-6">
            <EasaBadge variant="dark" />
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="accent" className="hero-cta-primary w-full sm:w-auto" asChild>
              <Link href={enrollHref}>
                Enrol {priceLabel ? `from ${priceLabel}` : "now"}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
              asChild
            >
              <Link
                href={
                  live
                    ? `${routes.onlineCoursesBasics}?mode=recorded`
                    : `${routes.onlineCoursesBasics}?mode=live`
                }
              >
                {live ? "View recorded lane" : "View live one-to-one"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
