import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import { DEFAULT_ATPL_SUBJECT_BADGE } from "@/services/marketing/atpl-subjects-seed";
import { listAtplLandingSubjects } from "@/services/marketing/atpl-subjects-service";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

/**
 * Package review list for /atpl — the client's 13 subjects in the agreed order.
 * CMS copy/images are reused when a matching syllabus code exists.
 */
export function listAtplPackageReviewSubjects(): AtplLandingSubjectPublic[] {
  const byCode = new Map(
    listAtplLandingSubjects({ includeHidden: true })
      .filter((row) => row.code)
      .map((row) => [row.code, row]),
  );

  return ATPL_COMPLETE_PACKAGE_SUBJECTS.map((subject) => {
    const cms = byCode.get(subject.code);
    return {
      id: cms?.id ?? `atpl-package-${subject.code}`,
      code: subject.code,
      title: subject.title,
      shortDescription: cms?.shortDescription?.trim() || subject.shortDescription,
      badgeLabel: cms?.badgeLabel?.trim() || DEFAULT_ATPL_SUBJECT_BADGE,
      imageUrl: cms?.imageUrl ?? null,
    };
  });
}
