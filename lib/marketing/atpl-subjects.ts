/**
 * Public ATPL subject modules for marketing pages.
 * Reads the Super Admin CMS store — never the LMS course catalogue.
 */

import { listPublicAtplSubjects } from "@/services/marketing/atpl-subjects-service";

export type AtplSubjectModule = {
  code: string;
  title: string;
  shortDescription: string;
};

/** Visible ATPL landing subjects configured in Super Admin. */
export function listAtplSubjectModules(): AtplSubjectModule[] {
  return listPublicAtplSubjects().map((subject) => ({
    code: subject.code,
    title: subject.title,
    shortDescription: subject.shortDescription,
  }));
}
