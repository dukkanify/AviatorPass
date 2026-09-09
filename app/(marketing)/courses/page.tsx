import type { Metadata } from "next";

import { PublicCourseCatalog } from "@/features/courses/components/public-course-catalog";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Course catalog",
  description:
    "Browse Aviator Pass courses by category — live and recorded programmes taught by EASA Certified Instructors.",
  alternates: { canonical: routes.courses },
  openGraph: {
    title: `Course catalog | ${siteConfig.name}`,
    url: routes.courses,
  },
};

export default function CoursesCatalogPage() {
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app">
          <p className="atpl-kicker">Catalog</p>
          <h1 className="atpl-heading-light mt-4 max-w-[16ch]">Courses by category</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            Categories, order, live or recorded badges, and featured courses are managed from Super
            Admin and appear here automatically.
          </p>
        </div>
      </section>
      <section className="atpl-section atpl-section-light">
        <div className="container-app">
          <PublicCourseCatalog />
        </div>
      </section>
    </div>
  );
}
