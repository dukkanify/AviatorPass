import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MEETING_SDK_APP_NAME,
  MEETING_SDK_DIRECT_LANDING_PATH,
  MEETING_SDK_DOC_SECTIONS,
  MEETING_SDK_DOCS_PATH,
  MEETING_SDK_INDEPENDENCE,
  MEETING_SDK_SHORT_DESCRIPTION,
} from "@/features/zoom/content/meeting-sdk-public";

describe("Meeting SDK Marketplace copy", () => {
  it("names the application AviatorPass Classroom for Zoom", () => {
    expect(MEETING_SDK_APP_NAME).toBe("AviatorPass Classroom for Zoom");
    expect(MEETING_SDK_DIRECT_LANDING_PATH).toBe("/join");
    expect(MEETING_SDK_DOCS_PATH).toBe("/integrations/zoom");
    expect(MEETING_SDK_DIRECT_LANDING_PATH).not.toBe("/instructor/profile");
  });

  it("includes the required public documentation sections", () => {
    const headings = MEETING_SDK_DOC_SECTIONS.map((section) => section.heading);
    expect(headings).toEqual(
      expect.arrayContaining([
        "Prerequisites",
        "Adding the app",
        "Using the app",
        "Removing the app",
        "Authorization",
        "Disconnect, deauthorization, and user impact",
        "Troubleshooting",
      ]),
    );
  });

  it("does not imply that Zoom owns or endorses AviatorPass", () => {
    const text = [
      MEETING_SDK_APP_NAME,
      MEETING_SDK_SHORT_DESCRIPTION,
      MEETING_SDK_INDEPENDENCE,
      ...MEETING_SDK_DOC_SECTIONS.flatMap((section) => [
        section.heading,
        ...section.paragraphs,
        ...(section.bullets ?? []),
      ]),
    ].join("\n");
    expect(text).not.toMatch(/official Zoom|Zoom-owned|endorsed by Zoom|Zoom's app/i);
    expect(text).toMatch(/does not own, operate, or endorse/);
    expect(text).toMatch(/does not use a separate user OAuth flow/);
  });

  it("publishes the documentation page and the classroom lobby", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/(marketing)/integrations/zoom/page.tsx"),
      "utf8",
    );
    const lobby = readFileSync(resolve(process.cwd(), "app/join/page.tsx"), "utf8");
    expect(page).toContain("MEETING_SDK_DOC_SECTIONS");
    expect(lobby).toContain("ClassroomLobby");
    expect(lobby).not.toContain("/instructor/profile");
  });
});
