import { describe, expect, it } from "vitest";

import { routes } from "@/constants/routes";
import {
  LEGAL_UPDATED_LABEL,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
  TERMS_SECTIONS,
  TERMS_TITLE,
} from "@/features/legal/content";
import { siteStatic } from "@/config/site-static";

describe("public legal pages", () => {
  it("exposes stable Terms and Privacy routes used by registration", () => {
    expect(routes.legal.terms).toBe("/legal/terms");
    expect(routes.legal.privacy).toBe("/legal/privacy");
  });

  it("covers registration, OTP, and notifications in the Terms of Service", () => {
    const blob = TERMS_SECTIONS.flatMap((s) => [
      s.heading,
      ...s.paragraphs,
      ...(s.bullets ?? []),
    ]).join(" ");
    expect(TERMS_TITLE).toBe("Terms of Service");
    expect(blob).toContain("one-time verification code");
    expect(blob).toContain("spam");
    expect(blob.toLowerCase()).toContain("notification");
    expect(blob).toContain(siteStatic.supportEmail);
    expect(LEGAL_UPDATED_LABEL).toMatch(/2026/);
  });

  it("explains how registration data is used in the Privacy Policy", () => {
    const blob = PRIVACY_SECTIONS.flatMap((s) => [
      s.heading,
      ...s.paragraphs,
      ...(s.bullets ?? []),
    ]).join(" ");
    expect(PRIVACY_TITLE).toBe("Privacy Policy");
    expect(blob).toContain("one-time code");
    expect(blob).toContain("password hash");
    expect(blob).toContain(siteStatic.contactEmail);
  });
});
