import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FINAL_REVIEW_PATH,
  FINAL_REVIEW_SECTIONS,
  FINAL_REVIEW_TITLE,
} from "@/features/zoom/content/marketplace-final-review";
import { DEFAULT_ZOOM_OAUTH_SCOPES, REJECTED_ZOOM_OAUTH_SCOPES } from "@/services/zoom/config";

describe("Zoom Marketplace final review package", () => {
  it("publishes the consolidated reviewer document path", () => {
    expect(FINAL_REVIEW_PATH).toBe("/integrations/zoom-marketplace-review");
    expect(FINAL_REVIEW_TITLE).toContain("Final Review Test Plan");
    const page = readFileSync(
      resolve(process.cwd(), "app/(marketing)/integrations/zoom-marketplace-review/page.tsx"),
      "utf8",
    );
    expect(page).toContain("FINAL_REVIEW_SECTIONS");
  });

  it("covers the six reviewer requirements without passwords", () => {
    const text = FINAL_REVIEW_SECTIONS.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]).join("\n");
    expect(text).toMatch(/meeting:write:meeting/);
    expect(text).toMatch(/meeting:write:meeting:admin/);
    expect(text).toMatch(/Custom Form/);
    expect(text).toMatch(/Surface/);
    expect(text).toMatch(/Meeting SDK/);
    expect(text).toMatch(/zoom\.reviewer\.instructor@aviatorpass\.com/);
    expect(text).toMatch(/zoom\.reviewer\.student@aviatorpass\.com/);
    expect(text).not.toMatch(/Aa1!|DemoPass|password:\s*\S+/i);
  });

  it("keeps only user-level meeting create in code defaults", () => {
    expect(DEFAULT_ZOOM_OAUTH_SCOPES).toContain("meeting:write:meeting");
    expect(DEFAULT_ZOOM_OAUTH_SCOPES).not.toContain("meeting:write:meeting:admin");
    expect(REJECTED_ZOOM_OAUTH_SCOPES).toContain("meeting:write:meeting:admin");
  });
});
