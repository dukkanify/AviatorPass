import { EasaBadge } from "@/features/marketing/components/easa-badge";
import { MarketingSectionKicker } from "@/features/marketing/components/marketing-section-kicker";
import { INSTRUCTORS } from "@/features/marketing/content/atpl-pass-home";

function InstructorsPageContent() {
  return (
    <>
      <section
        id="instructors"
        className="atpl-section atpl-section-instructors scroll-mt-28 pt-16 sm:pt-20"
      >
        <div className="container-app">
          <MarketingSectionKicker>{INSTRUCTORS.kicker}</MarketingSectionKicker>
          <h1 className="atpl-heading-light mt-4 max-w-[20ch]">{INSTRUCTORS.title}</h1>
          <div className="mt-6">
            <EasaBadge variant="dark" />
          </div>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/62">
            {INSTRUCTORS.intro}
          </p>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {INSTRUCTORS.highlights.map((h) => (
              <article key={h.title} className="atpl-instructor-card">
                <h2 className="font-display text-base font-semibold text-white">{h.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{h.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export { InstructorsPageContent };
