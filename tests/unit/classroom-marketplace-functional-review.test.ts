import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLASSROOM_REVIEW_NOTE_MATRIX,
  CLASSROOM_REVIEW_PATH,
  CLASSROOM_REVIEW_READINESS,
  CLASSROOM_REVIEW_SECTIONS,
  CLASSROOM_REVIEW_TITLE,
  CLASSROOM_REVIEW_ZOOM_PASTE_TEXT,
} from "@/features/zoom/content/classroom-marketplace-functional-review";
import { MEETING_SDK_DOC_SECTIONS } from "@/features/zoom/content/meeting-sdk-public";
import { DEFAULT_ZOOM_OAUTH_SCOPES, REJECTED_ZOOM_OAUTH_SCOPES } from "@/services/zoom/config";

describe("Classroom Meeting SDK Marketplace functional review", () => {
  it("publishes the Classroom review page without passwords", () => {
    expect(CLASSROOM_REVIEW_PATH).toBe("/integrations/zoom-classroom-review");
    expect(CLASSROOM_REVIEW_TITLE).toContain("Classroom for Zoom");
    const page = readFileSync(
      resolve(process.cwd(), "app/(marketing)/integrations/zoom-classroom-review/page.tsx"),
      "utf8",
    );
    expect(page).toContain("CLASSROOM_REVIEW_SECTIONS");
    const text = CLASSROOM_REVIEW_SECTIONS.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]).join("\n");
    expect(text).toMatch(/Meeting SDK/);
    expect(text).toMatch(/zoom\.reviewer\.instructor@aviatorpass\.com/);
    expect(text).toMatch(/Custom Form/);
    expect(text).toMatch(/Meetings surface|Surface/);
    expect(text).not.toMatch(/Aa1!|DemoPass|password:\s*\S+|zak=/i);
  });

  it("covers all six October 22 notes in the matrix", () => {
    expect(CLASSROOM_REVIEW_NOTE_MATRIX).toHaveLength(6);
    expect(CLASSROOM_REVIEW_NOTE_MATRIX.map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps Classroom free of Instructor OAuth admin create scopes in code defaults", () => {
    expect(DEFAULT_ZOOM_OAUTH_SCOPES).toContain("meeting:write:meeting");
    expect(DEFAULT_ZOOM_OAUTH_SCOPES).not.toContain("meeting:write:meeting:admin");
    expect(REJECTED_ZOOM_OAUTH_SCOPES).toContain("meeting:write:meeting:admin");
    const sdkText = MEETING_SDK_DOC_SECTIONS.flatMap((s) => [
      s.heading,
      ...s.paragraphs,
      ...(s.bullets ?? []),
    ]).join("\n");
    expect(sdkText).toMatch(
      /does not request user-managed scopes|does not use a separate user OAuth/i,
    );
    expect(sdkText).toMatch(/Detailed Meeting SDK test/);
  });

  it("exports Zoom paste text covering all six notes without secrets", () => {
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/Classroom for Zoom/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/Create a Meeting/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/Meetings surface/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/Custom Form/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/zoom\.reviewer\.instructor@aviatorpass\.com/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/zoom-classroom-review/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/Do NOT submit/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).toMatch(/NOT READY/);
    expect(CLASSROOM_REVIEW_ZOOM_PASTE_TEXT).not.toMatch(/Aa1!|DemoPass|password:\s*\S+|zak=/i);
    const openManual = CLASSROOM_REVIEW_NOTE_MATRIX.filter((n) => n.status.startsWith("open_"));
    expect(openManual.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("records final readiness as not ready and rejects CEO provisioning", () => {
    expect(CLASSROOM_REVIEW_READINESS.verdict).toBe("NOT_READY");
    expect(CLASSROOM_REVIEW_READINESS.ceoPlatformProvisionSupported).toBe(false);
    expect(CLASSROOM_REVIEW_READINESS.blockers.length).toBeGreaterThan(0);
    expect(CLASSROOM_REVIEW_READINESS.ceoPlatformProvisionReason).toMatch(/never falls back/i);
  });
});
