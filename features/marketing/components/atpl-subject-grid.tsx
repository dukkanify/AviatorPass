import { cn } from "@/lib/utils";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

function AtplSubjectGrid({
  subjects,
  reveal = false,
}: {
  subjects: AtplLandingSubjectPublic[];
  reveal?: boolean;
}) {
  if (!subjects.length) return null;

  return (
    <div className="atpl-subject-grid mt-12">
      {subjects.map((subject, index) => (
        <article
          key={subject.id}
          className={cn("atpl-subject-card", reveal && "atpl-reveal")}
          style={reveal ? { animationDelay: `${index * 40}ms` } : undefined}
        >
          {subject.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={subject.imageUrl} alt="" className="atpl-subject-media" />
          ) : null}
          <span className="atpl-subject-code">{subject.code || "\u00a0"}</span>
          <h3 className="atpl-subject-title">{subject.title}</h3>
          {subject.shortDescription ? (
            <p className="atpl-subject-copy">{subject.shortDescription}</p>
          ) : (
            <p className="atpl-subject-copy atpl-subject-copy-empty" aria-hidden>
              {"\u00a0"}
            </p>
          )}
          <span className="atpl-subject-badge">{subject.badgeLabel}</span>
        </article>
      ))}
    </div>
  );
}

export { AtplSubjectGrid };
