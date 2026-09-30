import { describe, expect, it } from "vitest";

import { resetAtplMarketingDbForTests } from "@/services/marketing/atpl-subjects-store";
import { atplSubjectPublicHref } from "@/lib/marketing/atpl-subject-ref";
import { resolveAtplSubjectRef } from "@/lib/marketing/resolve-atpl-subject";

describe("ATPL public subject URLs", () => {
  it("opens Meteorology from met, meteorology, and 050", () => {
    resetAtplMarketingDbForTests();
    for (const ref of ["met", "MET", "meteorology", "050", "ATPL-050"]) {
      const subject = resolveAtplSubjectRef(ref);
      expect(subject?.code).toBe("050");
      expect(subject?.title).toBe("Meteorology");
    }
    expect(atplSubjectPublicHref({ code: "050", title: "Meteorology" })).toBe("/courses/met");
  });

  it("does not treat unknown slugs as ATPL subjects", () => {
    resetAtplMarketingDbForTests();
    expect(resolveAtplSubjectRef("ppl-live-01")).toBeNull();
    expect(resolveAtplSubjectRef("")).toBeNull();
  });
});
