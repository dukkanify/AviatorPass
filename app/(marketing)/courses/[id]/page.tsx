import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AtplSubjectPublicPage } from "@/features/marketing/components/atpl-subject-public-page";
import { PublicCatalogCoursePage } from "@/features/marketing/components/public-catalog-course-page";
import { routes } from "@/constants/routes";
import { resolveRequestCheckoutCountry } from "@/lib/marketing/checkout-country";
import { getAtplProgramMarketing } from "@/lib/marketing/atpl-program-marketing";
import { resolveAtplSubjectRef } from "@/lib/marketing/atpl-subject-ref";
import { getPublicListedCourseByRef } from "@/services/courses/course-service";
import { listAtplPackageReviewSubjects } from "@/services/marketing/atpl-package-review";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const subject = resolveAtplSubjectRef(id);
  if (subject) {
    return {
      title: subject.title,
      description: subject.shortDescription || `${subject.title} — ATPL subject`,
    };
  }
  const course = getPublicListedCourseByRef(id);
  if (course) {
    return { title: course.title, description: course.shortDescription || course.title };
  }
  return { title: "Course" };
}

export default async function PublicCourseOrSubjectPage({ params }: PageProps) {
  const { id } = await params;
  const subject = resolveAtplSubjectRef(id);
  if (subject) {
    const country = await resolveRequestCheckoutCountry();
    const { enrollHref, priceLabel } = getAtplProgramMarketing(country);
    return (
      <AtplSubjectPublicPage
        subject={subject}
        enrollHref={enrollHref}
        priceLabel={priceLabel}
        siblings={listAtplPackageReviewSubjects()}
      />
    );
  }

  const course = getPublicListedCourseByRef(id);
  if (course) {
    return <PublicCatalogCoursePage course={course} />;
  }

  redirect(routes.courses);
}
