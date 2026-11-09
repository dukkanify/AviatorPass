/**
 * Site copy CMS — editable marketing page text (v1 primary fields).
 */

export const SITE_COPY_PAGE_IDS = [
  "home",
  "atpl",
  "online-courses",
  "online-courses-basics",
  "online-courses-ppl",
  "online-courses-elp",
  "flightpath",
  "live",
  "contact",
] as const;

export type SiteCopyPageId = (typeof SITE_COPY_PAGE_IDS)[number];

export type SiteCopyFieldDef = {
  key: string;
  label: string;
  multiline?: boolean;
};

export type SiteCopyPageDef = {
  id: SiteCopyPageId;
  label: string;
  path: string;
  fields: SiteCopyFieldDef[];
};

/** Flat string overrides per page. Empty / missing → code default. */
export type SiteCopyPageOverrides = Record<string, string>;

export type SiteCopyDatabase = {
  pages: Partial<Record<SiteCopyPageId, SiteCopyPageOverrides>>;
  updatedAt: string | null;
};

export type SiteCopyPageSnapshot = {
  id: SiteCopyPageId;
  label: string;
  path: string;
  fields: Array<SiteCopyFieldDef & { defaultValue: string; value: string; overridden: boolean }>;
};
