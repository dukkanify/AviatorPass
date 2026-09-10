"use client";

import * as React from "react";
import { GraduationCap, Compass, Headset, Clock3 } from "lucide-react";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/constants/routes";
import { learningFetch } from "@/features/learning/lib/api";
import type { CourseOffer } from "@/services/learning/course-offers-service";

function OfferCard({ offer, recommended }: { offer: CourseOffer; recommended?: boolean }) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="relative h-36 overflow-hidden bg-[rgb(18_36_51_/0.08)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- catalog cover with local fallback */}
        <img
          src={offer.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.src = "/images/hero-aviation.svg";
          }}
        />
        {recommended ? (
          <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Recommended
          </span>
        ) : null}
      </div>
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-lg leading-tight">{offer.title}</CardTitle>
        <CardDescription className="line-clamp-3">{offer.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden />
            {offer.durationLabel}
          </span>
          <span className="font-medium text-foreground">{offer.priceLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="hero-cta-primary">
            <Link href={offer.enrollHref}>Enrol now</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={offer.href}>View course</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyCoursesEmptyState() {
  const [featured, setFeatured] = React.useState<CourseOffer[]>([]);
  const [recommended, setRecommended] = React.useState<CourseOffer[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await learningFetch<{
        featured: CourseOffer[];
        recommended: CourseOffer[];
      }>("/api/learning/course-offers");
      if (cancelled) return;
      setFeatured(result.data?.featured ?? []);
      setRecommended(result.data?.recommended ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendedLead = recommended[0] ?? featured[0] ?? null;

  return (
    <div className="space-y-8">
      <section
        className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft sm:p-8"
        aria-labelledby="my-courses-empty-title"
      >
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-2xl" aria-hidden>
            🎓
          </p>
          <h2 id="my-courses-empty-title" className="mt-2 font-display text-2xl tracking-tight">
            No courses yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You haven&apos;t enrolled in any courses yet.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Browse our available courses and start your aviation journey today.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild className="hero-cta-primary min-w-[10rem]">
              <Link href={routes.courses}>Browse Courses</Link>
            </Button>
            <Button asChild variant="outline" className="min-w-[10rem]">
              <Link href={routes.atpl}>Explore ATPL Course</Link>
            </Button>
            <Button asChild variant="ghost" className="min-w-[10rem]">
              <Link href={routes.contact}>
                <Headset className="size-4" aria-hidden />
                Contact Advisor
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {recommendedLead ? (
        <section className="space-y-3" aria-labelledby="recommended-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Recommended for you
              </p>
              <h3 id="recommended-title" className="font-display text-xl">
                {recommendedLead.title}
              </h3>
              <p className="text-sm text-muted-foreground">{recommendedLead.reason}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={recommendedLead.href}>
                <Compass className="size-4" aria-hidden />
                View
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4" aria-labelledby="featured-courses-title">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Featured courses
          </p>
          <h3 id="featured-courses-title" className="font-display text-xl">
            Start with a programme that fits your path
          </h3>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading featured courses…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(featured.length ? featured : recommended).map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                recommended={offer.id === recommendedLead?.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export { MyCoursesEmptyState };
