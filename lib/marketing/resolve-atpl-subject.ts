import { officialAtplSubjectForRef } from "@/lib/marketing/atpl-subject-ref";
import { listAtplPackageReviewSubjects } from "@/services/marketing/atpl-package-review";
import type { AtplLandingSubjectPublic } from "@/types/atpl-subjects";

export function resolveAtplSubjectRef(ref: string): AtplLandingSubjectPublic | null {
  const official = officialAtplSubjectForRef(ref);
  if (!official) return null;
  return listAtplPackageReviewSubjects().find((row) => row.code === official.code) ?? null;
}
