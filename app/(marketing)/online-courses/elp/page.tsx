import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { ArrowUpRight, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";
import { EasaBadge } from "@/features/marketing/components/easa-badge";
import { ELP_PAGE } from "@/features/marketing/content/online-courses";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "ELP Mock Exams Live",
  description:
    "Live English Language Proficiency mock examinations with EASA Certified Instructors at Aviator Pass.",
  alternates: { canonical: routes.onlineCoursesElp },
};

export default function ElpMockExamsPage() {
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app max-w-3xl">
          <p className="atpl-kicker">{ELP_PAGE.kicker}</p>
          <h1 className="atpl-heading-light mt-4">{ELP_PAGE.title}</h1>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-accent">Live</p>
          <p className="mt-5 text-base leading-relaxed text-white/70">{ELP_PAGE.intro}</p>
          <div className="mt-6">
            <EasaBadge variant="dark" />
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="accent" className="hero-cta-primary w-full sm:w-auto" asChild>
              <Link href={routes.login}>
                Sign in to schedule
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
              asChild
            >
              <a href={`mailto:${siteStatic.supportEmail}`}>
                <Mail className="h-4 w-4" />
                Email student support
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
