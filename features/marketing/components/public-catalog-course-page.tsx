import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import type { Course } from "@/types/courses";

function PublicCatalogCoursePage({ course }: { course: Course }) {
  const image = course.coverImageUrl || course.thumbnailUrl;
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <p className="atpl-kicker">{course.code || "Course"}</p>
            <h1 className="atpl-heading-light mt-4 max-w-[16ch]">{course.title}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              {course.shortDescription || course.fullDescription || "Live AviatorPass programme."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="accent" asChild>
                <Link href={routes.checkout}>Enrol</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 text-white" asChild>
                <Link href={routes.courses}>All courses</Link>
              </Button>
            </div>
          </div>
          {image ? (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="aspect-[4/3] w-full object-cover" />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export { PublicCatalogCoursePage };
