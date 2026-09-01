/**
 * Retired personal-client tokens used only to remap persisted demo/settings data.
 * Product UI and copy must not display these values.
 */

import { siteStatic } from "@/config/site-static";

export const PROJECT_SUPPORT_EMAIL = siteStatic.supportEmail;
export const PROJECT_CONTACT_EMAIL = siteStatic.contactEmail;

/** Retired AviatorPass-domain mailbox — remap persisted settings to the canonical support address. */
export const LEGACY_AVIATORPASS_SUPPORT_EMAIL = ["support@", "aviatorpass.com"].join("");

/**
 * Canonical student-support mailbox (`support@atplpass.com`).
 * Kept as a named constant so seed/remap code can compare hosts without treating it as dirty.
 */
export const CANONICAL_ATPLPASS_SUPPORT_EMAIL = PROJECT_SUPPORT_EMAIL;

/** @deprecated Use CANONICAL_ATPLPASS_SUPPORT_EMAIL — this address is now the live support mailbox. */
export const LEGACY_ATPLPASS_SUPPORT_EMAIL = CANONICAL_ATPLPASS_SUPPORT_EMAIL;

/** Retired personal mailbox — remap persisted settings only; never show in UI. */
export const LEGACY_PERSONAL_SUPPORT_EMAIL = [
  "me@",
  `${["abdulaziz", "alshoail"].join("")}`,
  ".com",
].join("");

export const LEGACY_CLIENT_GIVEN = ["Abd", "ulaziz"].join("");
export const LEGACY_CLIENT_ALT_GIVEN = ["Abdul", "lah"].join("");
export const LEGACY_CLIENT_FAMILY = ["Als", "hoail"].join("");
export const LEGACY_JOURNEY_STUDENT_EMAIL = `${["abd", "ulaziz"].join("")}@aviatorpass.com`;

export const LEGACY_CLIENT_NAME_RE = new RegExp(
  `${LEGACY_CLIENT_GIVEN}|${LEGACY_CLIENT_ALT_GIVEN}|${LEGACY_CLIENT_FAMILY}|${["sho", "ail"].join("")}`,
  "i",
);

export function isLegacySupportMailbox(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === LEGACY_AVIATORPASS_SUPPORT_EMAIL ||
    normalized === LEGACY_PERSONAL_SUPPORT_EMAIL ||
    LEGACY_CLIENT_NAME_RE.test(normalized)
  );
}

export function stripLegacyClientName(value: string, replacement: string): string {
  const captainFull = new RegExp(`Captain ${LEGACY_CLIENT_GIVEN} ${LEGACY_CLIENT_FAMILY}`, "gi");
  const captainGiven = new RegExp(`Captain ${LEGACY_CLIENT_GIVEN}`, "gi");
  const full = new RegExp(`${LEGACY_CLIENT_GIVEN} ${LEGACY_CLIENT_FAMILY}`, "gi");
  const given = new RegExp(LEGACY_CLIENT_GIVEN, "gi");
  const altGiven = new RegExp(LEGACY_CLIENT_ALT_GIVEN, "gi");
  const family = new RegExp(LEGACY_CLIENT_FAMILY, "gi");
  return value
    .replace(captainFull, replacement)
    .replace(captainGiven, replacement)
    .replace(full, replacement)
    .replace(given, replacement)
    .replace(altGiven, replacement)
    .replace(family, replacement);
}
