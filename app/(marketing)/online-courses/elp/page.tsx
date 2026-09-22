import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { EasaBadge } from "@/features/marketing/components/easa-badge";
import { ELP_PAGE } from "@/features/marketing/content/online-courses";
import { ElpJourneyBooking } from "@/features/mock-exams/components/elp-journey-booking";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "ELP Mock Exams Live",
  description:
    "Book a live English Language Proficiency mock exam with an EASA Certified Instructor. Choose a slot, review rush fees, pay, then join Zoom.",
  alternates: { canonical: routes.onlineCoursesElp },
};

const STEPS = [
  {
    title: "Choose the service",
    body: "Open Aviator Pass and select English Language Proficiency → Mock Exam.",
  },
  {
    title: "Pick a slot",
    body: "Only working hours appear: Monday–Friday 17:00–20:00 and Saturday–Sunday 09:00–18:00 (Kuwait time).",
  },
  {
    title: "Review the price",
    body: "A rush fee applies under 24 hours. A higher fee applies between 6 and 12 hours. The total shows before you pay.",
  },
  {
    title: "Confirm and pay",
    body: "Review your name, service, date, time, base price, and any extra fees, then pay on the platform.",
  },
  {
    title: "Meeting room",
    body: "After payment the system creates a Zoom room named Mock Exam / family name / date.",
  },
  {
    title: "Emails",
    body: "Student, instructor, and Super Admin each receive the booking details and join link.",
  },
  {
    title: "Sit the mock exam",
    body: "Join at the booked time. The instructor can share the screen and send files or links.",
  },
  {
    title: "Examiner approval",
    body: "The instructor ends the session and marks it completed. Status becomes Completed.",
  },
  {
    title: "Aviator Pass certificate",
    body: "After approval the certificate is saved in your account and emailed to you.",
  },
];

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
              <a href="#book">
                Book a mock exam
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="outline"
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
              asChild
            >
              <Link href={`${routes.login}?next=${encodeURIComponent("/student/mock-exams")}`}>
                I already have an account
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="atpl-section atpl-section-dark border-t border-white/10 py-12">
        <div className="container-app max-w-3xl space-y-4">
          <h2 className="atpl-heading-light text-2xl">How the ELP mock exam works</h2>
          <ol className="space-y-3 text-sm text-white/75">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="font-semibold text-white">
                  {index + 1}. {step.title}.
                </span>{" "}
                {step.body}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="book" className="atpl-section atpl-section-dark border-t border-white/10 py-12">
        <div className="container-app max-w-3xl">
          <ElpJourneyBooking />
        </div>
      </section>
    </div>
  );
}
