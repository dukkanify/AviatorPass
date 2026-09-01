import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { OnlineCoursesHub } from "@/features/marketing/components/online-courses-hub";
import { ONLINE_COURSES_FAQ } from "@/features/marketing/content/online-courses";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Online Courses",
  description:
    "Aviator Pass Online Courses: ATPL Course, Basics of Aviation, Private Pilot License, and ELP Mock Exams Live — taught by EASA Certified Instructors.",
  alternates: { canonical: routes.onlineCourses },
};

export default function OnlineCoursesPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Aviator Pass Online Courses",
          url: `${siteConfig.url}${routes.onlineCourses}`,
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "ATPL Course",
              url: `${siteConfig.url}${routes.atpl}`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Basics of Aviation",
              url: `${siteConfig.url}${routes.onlineCoursesBasics}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: "ELP Mock Exams Live",
              url: `${siteConfig.url}${routes.onlineCoursesElp}`,
            },
            {
              "@type": "ListItem",
              position: 4,
              name: "Private Pilot License",
              url: `${siteConfig.url}${routes.onlineCoursesPpl}`,
            },
          ],
          mainEntity: ONLINE_COURSES_FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <OnlineCoursesHub />
    </>
  );
}
