/**
 * Retired personal-client tokens used only to remap persisted demo/settings data.
 * Product UI and copy must not display these values.
 */

import { siteStatic } from "@/config/site-static";

export const PROJECT_SUPPORT_EMAIL = siteStatic.supportEmail;

export const LEGACY_ATPLPASS_SUPPORT_EMAIL = ["support@", "atplpass.com"].join("");
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
