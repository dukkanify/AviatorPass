import type { Metadata } from "next";
import { Headset, Mail, MessagesSquare } from "lucide-react";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Contact an advisor",
  description: "Speak with Aviator Pass about ATPL, PPL, Basics of Aviation, or ELP mock exams.",
  alternates: { canonical: routes.contact },
  openGraph: {
    title: `Contact an advisor | ${siteConfig.name}`,
    url: routes.contact,
  },
};

export default function ContactPage() {
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app max-w-3xl">
          <p className="atpl-kicker">{siteStatic.tagline}</p>
          <h1 className="atpl-heading-light mt-4">Contact an advisor</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            Tell us where you are in your aviation journey. We will help you choose ATPL, Basics of
            Aviation, Private Pilot License, or ELP mock exams.
          </p>
        </div>
      </section>

      <section className="atpl-section atpl-section-light">
        <div className="container-app grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft sm:p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Headset className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="font-display text-2xl tracking-tight">Talk to the academy team</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Email is the fastest way to reach an advisor. There is no WhatsApp or public live chat
              — we keep student communication on official Aviator Pass channels.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild className="hero-cta-primary">
                <a href={`mailto:${siteConfig.contactEmail}`}>
                  <Mail className="size-4" aria-hidden />
                  Email {siteConfig.contactEmail}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`mailto:${siteConfig.supportEmail}`}>
                  <MessagesSquare className="size-4" aria-hidden />
                  Student support
                </a>
              </Button>
            </div>
          </article>

          <aside className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-xl tracking-tight">Prefer to browse first?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Open the catalogue or the ATPL landing page, then enrol when you are ready.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button asChild className="hero-cta-primary">
                <Link href={routes.courses}>Browse Courses</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={routes.atpl}>Explore ATPL Course</Link>
              </Button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
