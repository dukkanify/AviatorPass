import type { Metadata } from "next";

import { InstructorsPageContent } from "@/features/marketing/components/instructors-page-content";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Instructors",
  description:
    "Meet Aviator Pass EASA Certified Instructors — professional aviation educators delivering live ATPL, PPL, Basics, and ELP training.",
  alternates: { canonical: routes.instructors },
  openGraph: {
    title: `Instructors | ${siteConfig.name}`,
    url: `${siteConfig.url}${routes.instructors}`,
  },
};

export default function InstructorsPage() {
  return (
    <div className="landing-root home-premium">
      <InstructorsPageContent />
    </div>
  );
}
