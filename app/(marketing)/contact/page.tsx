import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { Headset, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { siteStatic } from "@/config/site-static";
import { routes } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Contact an advisor",
  description: "Speak with Aviator Pass about ATPL, PPL, Basics of Aviation, or ELP mock exams.",
  alternates: { canonical: routes.contact },
};

export default function ContactPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="hero-aviation absolute inset-0" />
      <div className="absolute inset-0 bg-[#0B1A24]/55 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/60 bg-card/95 p-8 text-center shadow-medium">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Headset className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
          {siteStatic.tagline}
        </p>
        <h1 className="mt-2 font-display text-2xl tracking-tight">Contact an advisor</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Tell us where you are in your aviation journey. We will help you choose ATPL, Basics of
          Aviation, Private Pilot License, or ELP mock exams.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild className="hero-cta-primary">
            <a href={`mailto:${siteConfig.contactEmail}`}>
              <Mail className="size-4" aria-hidden />
              Email {siteConfig.contactEmail}
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${routes.home}#contact`}>Open homepage contact</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={routes.courses}>Browse Courses</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
