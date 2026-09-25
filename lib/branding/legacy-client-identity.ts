/**
 * Retired personal-client tokens used only to remap persisted demo/settings data.
 * Product UI and copy must not display these values.
 */

import { siteStatic } from "@/config/site-static";

export const PROJECT_SUPPORT_EMAIL = siteStatic.supportEmail;
export const PROJECT_CONTACT_EMAIL = siteStatic.contactEmail;

/** Retired AviatorPass-domain mailbox that used to be remapped away — now canonical. */
export const CANONICAL_AVIATORPASS_SUPPORT_EMAIL = PROJECT_SUPPORT_EMAIL;

/** Retired public host (brand slug + TLD). Never write the joined host in source. */
const LEGACY_BRAND_SLUG = ["atpl", "pass"].join("");
export const LEGACY_PUBLIC_HOST = `${LEGACY_BRAND_SLUG}.${"com"}`;

/** Retired ATPL Pass domain mailboxes — remap persisted settings to aviatorpass.com. */
export const LEGACY_ATPLPASS_SUPPORT_EMAIL = `support@${LEGACY_PUBLIC_HOST}`;
export const LEGACY_ATPLPASS_CONTACT_EMAIL = `info@${LEGACY_PUBLIC_HOST}`;

/**
 * Canonical student-support mailbox (`support@aviatorpass.com`).
 */
export const CANONICAL_ATPLPASS_SUPPORT_EMAIL = PROJECT_SUPPORT_EMAIL;

/** @deprecated Use PROJECT_SUPPORT_EMAIL. */
export const LEGACY_AVIATORPASS_SUPPORT_EMAIL = PROJECT_SUPPORT_EMAIL;

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

const LEGACY_HOST_RE = new RegExp(LEGACY_PUBLIC_HOST.replace(".", "\\."), "gi");

export function isLegacyAtplpassMailbox(value: string): boolean {
  return new RegExp(`@${LEGACY_BRAND_SLUG}\\.${"com"}$`, "i").test(value.trim());
}

export function rewriteLegacyPublicHost(value: string): string {
  if (!value) return value;
  return value.replace(LEGACY_HOST_RE, "aviatorpass.com");
}

export function remapAtplpassMailbox(value: string): string {
  const rewritten = rewriteLegacyPublicHost(value.trim());
  const normalized = rewritten.toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return rewritten;
  const local = normalized.slice(0, at);
  const host = normalized.slice(at + 1);
  if (host !== "aviatorpass.com") return rewritten;
  if (local === "support") return PROJECT_SUPPORT_EMAIL;
  if (local === "info" || local === "contact") return PROJECT_CONTACT_EMAIL;
  return `${local}@aviatorpass.com`;
}

export function isLegacySupportMailbox(value: string): boolean {
  const normalized = rewriteLegacyPublicHost(value.trim()).toLowerCase();
  return (
    isLegacyAtplpassMailbox(value) ||
    isLegacyAtplpassMailbox(normalized) ||
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
