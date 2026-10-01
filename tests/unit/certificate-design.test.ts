import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  alignCertificateNumber,
  certificateNumberPrefix,
  makeCourseCertificateNumber,
} from "@/lib/certificates/certificate-number";
import { resolveCertificateSubjectName } from "@/lib/certificates/subject-name";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { getCourseById } from "@/services/courses/course-service";
import { ensureCertificatesSeeded } from "@/services/certificates/seed";
import {
  listCertificates,
  renderCertificateHtml,
} from "@/services/certificates/certificate-service";

describe("certificate number follows the course", () => {
  it("uses PPL for PPL ground school and EASA codes for ATPL subjects", () => {
    expect(
      certificateNumberPrefix({
        courseCode: "PPL-GS-01",
        courseTitle: "PPL Ground School Essentials",
      }),
    ).toBe("PPL");
    expect(certificateNumberPrefix({ courseCode: "ATPL-050", courseTitle: "Meteorology" })).toBe(
      "050",
    );
    expect(certificateNumberPrefix({ courseCode: "ATPL-022" })).toBe("022");
    expect(makeCourseCertificateNumber({ courseCode: "PPL-GS-01", suffix: "DEMO01" })).toMatch(
      /^PPL-\d{4}-DEMO01$/,
    );
    expect(makeCourseCertificateNumber({ courseCode: "ATPL-061", suffix: "AA11" })).toMatch(
      /^061-\d{4}-AA11$/,
    );
  });

  it("replaces a hardcoded ATPL prefix without losing the unique tail", () => {
    expect(
      alignCertificateNumber("ATPL-2026-DEMO01", {
        courseCode: "PPL-GS-01",
        courseTitle: "PPL Ground School Essentials",
      }),
    ).toBe("PPL-2026-DEMO01");
    expect(alignCertificateNumber("ATPL-2026-ABCDEF", { courseCode: "ATPL-050" })).toBe(
      "050-2026-ABCDEF",
    );
  });
});

describe("certificate print uses the real course title", () => {
  it("keeps official ATPL titles on the subject line", () => {
    ensureCoursesSeeded();
    const met = getCourseById("ATPL-050");
    expect(met?.code).toBe("ATPL-050");
    expect(
      resolveCertificateSubjectName({
        courseId: met!.id,
        fallback: "PPL Ground School Essentials",
      }),
    ).toBe("Meteorology");
  });

  it("centers the print artwork and prints the course number prefix", () => {
    const src = readFileSync(
      resolve(process.cwd(), "services/certificates/certificate-service.ts"),
      "utf8",
    );
    expect(src).toMatch(/centerpiece/);
    expect(src).toMatch(/align-items: center/);
    expect(src).toMatch(/justify-content: center/);
    expect(src).toMatch(/makeCourseCertificateNumber/);
    const body = readFileSync(resolve(process.cwd(), "constants/certificates.ts"), "utf8");
    expect(body).toMatch(/\{\{courseName\}\}/);
    expect(body).toMatch(/\{\{certificateNumber\}\}/);
  });

  it("prints the stored course title and course-specific number in the artwork", async () => {
    ensureCertificatesSeeded();
    const cert = listCertificates({ status: "issued" })[0];
    expect(cert).toBeTruthy();
    const { html } = await renderCertificateHtml(cert!.id);
    expect(html).toContain(cert!.courseName);
    expect(html).toContain(cert!.certificateNumber);
    expect(html).not.toMatch(/Certificate No\. ATPL-2026-DEMO01/);
    expect(html).toMatch(/class="page"/);
  });
});
