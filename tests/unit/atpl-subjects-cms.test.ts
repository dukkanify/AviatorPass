import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import { SUPER_ADMIN_NAV } from "@/constants/dashboard-nav";
import { OFFICIAL_ATPL_SUBJECTS } from "@/services/marketing/atpl-subjects-seed";
import {
  createAtplLandingSubject,
  deleteAtplLandingSubject,
  listAtplLandingSubjects,
  listPublicAtplSubjects,
  reorderAtplLandingSubjects,
  updateAtplLandingSubject,
} from "@/services/marketing/atpl-subjects-service";
import { resetAtplMarketingDbForTests } from "@/services/marketing/atpl-subjects-store";

const OFFICIAL_TITLES = [
  "Air Law",
  "Airframe, Systems, Electrics, Power Plant",
  "Instrumentation",
  "Mass & Balance",
  "Performance",
  "Flight Planning & Monitoring",
  "Performance (Second Performance subject as per syllabus)",
  "Human Performance & Limitations",
  "Meteorology",
  "General Navigation",
  "Radio Navigation",
  "Operational Procedures",
  "Principles of Flight",
  "Principles of Flight (Second Principles of Flight subject as per syllabus)",
  "Communications",
  "Dynamic Management",
];

const RETIRED_TITLES = [
  "AGK — Airframe & Systems",
  "AGK — Instrumentation",
  "Flight Planning",
  "Human Performance",
];

describe("ATPL subjects CMS", () => {
  beforeEach(() => {
    resetAtplMarketingDbForTests();
  });

  it("seeds the official 16-subject syllabus with no retired names", () => {
    expect(OFFICIAL_ATPL_SUBJECTS.map((s) => s.title)).toEqual(OFFICIAL_TITLES);
    expect(OFFICIAL_ATPL_SUBJECTS.map((s) => s.code)).toEqual([
      "010",
      "021",
      "022",
      "031",
      "032",
      "033",
      "034",
      "040",
      "050",
      "061",
      "062",
      "070",
      "081",
      "082",
      "090",
      "",
    ]);
    const titles = listPublicAtplSubjects().map((s) => s.title);
    expect(titles).toEqual(OFFICIAL_TITLES);
    expect(titles).toHaveLength(new Set(titles).size);
    for (const retired of RETIRED_TITLES) {
      expect(titles).not.toContain(retired);
    }
    expect(listPublicAtplSubjects().every((s) => s.badgeLabel === "Included")).toBe(true);
  });

  it("hides subjects from the public list without deleting them", async () => {
    const airLaw = listAtplLandingSubjects({ includeHidden: true }).find((s) => s.code === "010");
    expect(airLaw).toBeTruthy();
    await updateAtplLandingSubject({
      id: airLaw!.id,
      patch: { visible: false },
    });
    expect(listPublicAtplSubjects().map((s) => s.title)).not.toContain("Air Law");
    expect(
      listAtplLandingSubjects({ includeHidden: true }).some((s) => s.code === "010" && !s.visible),
    ).toBe(true);
  });

  it("creates, edits, reorders, and deletes from the Super Admin store", async () => {
    const created = await createAtplLandingSubject({
      code: "099",
      title: "Crew Resource Workshop",
      shortDescription: "Optional extra module.",
      badgeLabel: "Optional",
    });
    expect(created.title).toBe("Crew Resource Workshop");
    expect(listPublicAtplSubjects().some((s) => s.id === created.id)).toBe(true);

    const updated = await updateAtplLandingSubject({
      id: created.id,
      patch: { title: "CRM Workshop", badgeLabel: "Included" },
    });
    expect(updated.title).toBe("CRM Workshop");
    expect(updated.badgeLabel).toBe("Included");

    const current = listAtplLandingSubjects({ includeHidden: true });
    const reversed = [...current].reverse().map((s) => s.id);
    const reordered = await reorderAtplLandingSubjects({ ids: reversed });
    expect(reordered[0]?.id).toBe(reversed[0]);
    expect(listPublicAtplSubjects()[0]?.id).toBe(reversed[0]);

    await deleteAtplLandingSubject({ id: created.id });
    expect(listAtplLandingSubjects({ includeHidden: true }).some((s) => s.id === created.id)).toBe(
      false,
    );
  });

  it("exposes Super Admin management and keeps public pages CMS-driven", () => {
    expect(SUPER_ADMIN_NAV.some((item) => item.href === routes.superAdminAtplSubjects)).toBe(true);
    const program = readFileSync(
      path.join(process.cwd(), "features/marketing/components/atpl-program-page.tsx"),
      "utf8",
    );
    const home = readFileSync(
      path.join(process.cwd(), "features/marketing/components/atpl-pass-homepage.tsx"),
      "utf8",
    );
    const atplPage = readFileSync(
      path.join(process.cwd(), "app/(marketing)/atpl/page.tsx"),
      "utf8",
    );
    expect(program).toContain("AtplSubjectGrid");
    expect(home).toContain("AtplSubjectGrid");
    expect(atplPage).toContain("listPublicAtplSubjects");
    expect(program).not.toContain("AGK —");
    expect(home).not.toContain("AGK —");
  });
});
