import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { siteStatic } from "@/config/site-static";
import {
  PROJECT_CONTACT_EMAIL,
  PROJECT_SUPPORT_EMAIL,
  isLegacySupportMailbox,
  remapAtplpassMailbox,
} from "@/lib/branding/legacy-client-identity";
import {
  PRODUCTION_SITE_URL,
  canonicalCertificateVerifyUrl,
  publicCertificateVerifyUrl,
} from "@/lib/site-origin";
import { COURSE_BENEFITS } from "@/features/marketing/content/atpl-course-landing";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listCategories } from "@/services/courses/category-service";
import { listPublishedCoursesGroupedByCategory } from "@/services/courses/course-service";

describe("platform UX improvements", () => {
  it("uses official AviatorPass mailboxes instead of atplpass.com", () => {
    expect(siteStatic.supportEmail).toBe("support@aviatorpass.com");
    expect(siteStatic.contactEmail).toBe("info@aviatorpass.com");
    expect(PROJECT_SUPPORT_EMAIL).toBe("support@aviatorpass.com");
    expect(PROJECT_CONTACT_EMAIL).toBe("info@aviatorpass.com");
    expect(isLegacySupportMailbox("support@atplpass.com")).toBe(true);
    expect(remapAtplpassMailbox("support@atplpass.com")).toBe("support@aviatorpass.com");
    expect(remapAtplpassMailbox("info@atplpass.com")).toBe("info@aviatorpass.com");
  });

  it("builds certificate verification URLs on www.aviatorpass.com", () => {
    expect(publicCertificateVerifyUrl("70A8DBAE45594680")).toBe(
      `${PRODUCTION_SITE_URL}/verify/certificate?code=70A8DBAE45594680`,
    );
    expect(
      canonicalCertificateVerifyUrl(
        "http://localhost:3000/verify/certificate?code=70A8DBAE45594680",
      ),
    ).toBe(`${PRODUCTION_SITE_URL}/verify/certificate?code=70A8DBAE45594680`);
  });

  it("keeps ATPL landing conversion sections and renders CMS subject cards", () => {
    const source = readFileSync(
      path.join(process.cwd(), "features/marketing/components/atpl-program-page.tsx"),
      "utf8",
    );
    expect(source).not.toContain("WHO_SHOULD_JOIN");
    expect(source).not.toContain("LEARNING_OUTCOMES");
    expect(source).not.toContain("STUDENT_REVIEWS");
    expect(source).not.toContain("ATPL_SUBJECTS_13");
    expect(source).toContain("AtplSubjectGrid");
    expect(source).toContain('id="subjects"');
    expect(source).toContain("COURSE_OVERVIEW");
    expect(source).toContain("COURSE_BENEFITS");
    expect(source).toContain("PRICING");
    expect(source).toContain("AtplCourseFaq");
    expect(COURSE_BENEFITS.kicker).toBe("Course features");
  });

  it("exposes manageable categories and catalog grouping", () => {
    ensureCoursesSeeded();
    const categories = listCategories({ includeHidden: true });
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.every((c) => "seoTitle" in c && "imageUrl" in c)).toBe(true);
    const groups = listPublishedCoursesGroupedByCategory();
    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.every((g) =>
        g.courses.every(
          (course) =>
            typeof course.featured === "boolean" && typeof course.displayOrder === "number",
        ),
      ),
    ).toBe(true);
  });
});
