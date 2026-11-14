import type { Metadata } from "next";

import { AboutPageContent } from "@/features/marketing/components/about-page-content";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn who Aviator Pass is, our mission and vision, platform features, and why students choose EASA Certified Instructors for Basics, PPL, ATPL, and ELP.",
  alternates: { canonical: routes.about },
  openGraph: {
    title: `About | ${siteConfig.name}`,
    url: `${siteConfig.url}${routes.about}`,
  },
};

export default function AboutPage() {
  return (
    <div className="landing-root home-premium">
      <AboutPageContent />
    </div>
  );
}
