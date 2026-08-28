import { describe, expect, it } from "vitest";

import { siteStatic } from "@/config/site-static";
import { DEMO_ACCOUNTS } from "@/constants/demo-accounts";
import { ATPL_PASS, CONTACT } from "@/features/marketing/content/atpl-pass-home";
import {
  LEGACY_CLIENT_FAMILY,
  LEGACY_CLIENT_GIVEN,
  PROJECT_SUPPORT_EMAIL,
} from "@/lib/branding/legacy-client-identity";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import { JOURNEY_COURSES } from "@/services/journeys/customer-journey-catalog";

describe("AviatorPass project branding", () => {
  it("uses the configured support email in static, settings, and marketing copy", () => {
    expect(PROJECT_SUPPORT_EMAIL).toBe("support@aviatorpass.com");
    expect(siteStatic.supportEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(siteStatic.contactEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(ATPL_PASS.supportEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(CONTACT.kicker).toBe("Support");
    expect(CONTACT.title).toBe("Support");
    expect(DEFAULT_PLATFORM_SETTINGS.general.supportEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(DEFAULT_PLATFORM_SETTINGS.general.contactEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(DEFAULT_PLATFORM_SETTINGS.email.senderEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(DEFAULT_PLATFORM_SETTINGS.email.replyToEmail).toBe(PROJECT_SUPPORT_EMAIL);
    expect(DEFAULT_PLATFORM_SETTINGS.zoom.accountEmail).toBe(PROJECT_SUPPORT_EMAIL);
  });

  it("does not keep personal client social handles", () => {
    expect(siteStatic.socialHandle).toBe("");
    expect(DEFAULT_PLATFORM_SETTINGS.general.socialHandle).toBe("");
    expect(DEFAULT_PLATFORM_SETTINGS.general.socialLinks.instagram).toBe("");
    expect(DEFAULT_PLATFORM_SETTINGS.general.socialLinks.twitter).toBe("");
  });

  it("keeps demo people generic and never names the client", () => {
    for (const account of DEMO_ACCOUNTS) {
      const blob = `${account.firstName} ${account.lastName} ${account.email} ${account.bio ?? ""}`;
      expect(blob.toLowerCase()).not.toContain(LEGACY_CLIENT_FAMILY.toLowerCase());
      if (account.email !== PROJECT_SUPPORT_EMAIL) {
        expect(blob.toLowerCase()).not.toContain(LEGACY_CLIENT_GIVEN.toLowerCase());
      }
    }
  });

  it("describes journey courses without a personal instructor name", () => {
    for (const course of JOURNEY_COURSES) {
      expect(course.short.toLowerCase()).not.toContain(LEGACY_CLIENT_GIVEN.toLowerCase());
      expect(course.short.toLowerCase()).not.toContain(LEGACY_CLIENT_FAMILY.toLowerCase());
    }
  });

  it("exposes the project support email on the public brand snapshot", () => {
    const brand = getPublicBrandConfig();
    expect(brand.supportEmail.toLowerCase()).toBe(PROJECT_SUPPORT_EMAIL);
    expect(brand.contactEmail.toLowerCase()).toBe(PROJECT_SUPPORT_EMAIL);
    expect(brand.socialHandle.toLowerCase()).not.toContain(LEGACY_CLIENT_GIVEN.toLowerCase());
  });

  it("does not publish the retired personal support mailbox", () => {
    expect(siteStatic.supportEmail.toLowerCase()).not.toContain(LEGACY_CLIENT_FAMILY.toLowerCase());
    expect(siteStatic.contactEmail.toLowerCase()).not.toContain(LEGACY_CLIENT_FAMILY.toLowerCase());
    expect(PROJECT_SUPPORT_EMAIL.toLowerCase()).toBe("support@aviatorpass.com");
  });
});
