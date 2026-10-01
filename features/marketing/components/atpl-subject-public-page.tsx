import Link from "@/components/ui/app-link";
import { ArrowUpRight } from "lucide-react";

import { AtplSubjectCover } from "@/components/media/atpl-subject-cover";
import { Button } from "@/components/ui/button";
import { ATPL_COMPLETE_PACKAGE_NAME } from "@/constants/atpl-complete-package";
import { ACTION_LABELS } from "@/constants/programme-terms";
import { routes } from "@/constants/routes";
import { atplSubjectPublicHref } from "@/lib/marketing/atpl-subject-ref";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

type AtplSubjectPublicPageProps = {
  subject: AtplLandingSubjectPublic;
  enrollHref: string;
  priceLabel: string | null;
  siblings: AtplLandingSubjectPublic[];
};

function AtplSubjectPublicPage({
  subject,
  enrollHref,
  priceLabel,
  siblings,
}: AtplSubjectPublicPageProps) {
  return (
    <div className="landing-root home-premium">
      <section className="atpl-section atpl-section-dark pt-16 sm:pt-20">
        <div className="container-app grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <p className="atpl-kicker">ATPL {subject.code}</p>
            <h1 className="atpl-heading-light mt-4 max-w-[16ch]">{subject.title}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              {subject.shortDescription ||
                `${subject.title} is included in the ${ATPL_COMPLETE_PACKAGE_NAME}.`}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="accent" asChild>
                <Link href={enrollHref}>
                  {ACTION_LABELS.chooseThisPackage}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 text-white" asChild>
                <Link href={routes.atpl}>All 13 subjects</Link>
              </Button>
            </div>
            {priceLabel ? (
              <p className="mt-4 text-sm text-white/60">From {priceLabel} · live training</p>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <AtplSubjectCover
              src={subject.imageUrl}
              title={subject.title}
              code={subject.code}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>
      </section>
      <section className="atpl-section atpl-section-light">
        <div className="container-app">
          <p className="atpl-kicker">Included in the package</p>
          <h2 className="atpl-heading mt-4 max-w-[20ch]">The other ATPL subjects</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siblings
              .filter((row) => row.code !== subject.code)
              .map((row) => (
                <Link
                  key={row.id}
                  href={atplSubjectPublicHref(row)}
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:border-accent"
                >
                  <span className="text-xs text-muted-foreground">{row.code}</span>
                  <p className="font-medium text-foreground">{row.title}</p>
                </Link>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export { AtplSubjectPublicPage };
