/**
 * Site copy resolve / update / reset for Super Admin CMS.
 */

import {
  getSiteCopyDefaults,
  getSiteCopyPageDef,
  isSiteCopyPageId,
  SITE_COPY_PAGES,
} from "@/services/marketing/site-copy-catalog";
import { readSiteCopyDb, writeSiteCopyDb } from "@/services/marketing/site-copy-store";
import type {
  SiteCopyPageId,
  SiteCopyPageOverrides,
  SiteCopyPageSnapshot,
} from "@/types/site-copy";

function mergePageCopy(
  pageId: SiteCopyPageId,
  overrides: SiteCopyPageOverrides | undefined,
): Record<string, string> {
  const defaults = getSiteCopyDefaults(pageId);
  const merged = { ...defaults };
  if (!overrides) return merged;
  for (const key of Object.keys(defaults)) {
    const override = overrides[key];
    if (typeof override === "string" && override.trim()) {
      merged[key] = override;
    }
  }
  return merged;
}

/** Resolved flat copy for a marketing page (defaults ← overrides). */
export function resolvePageCopy(pageId: SiteCopyPageId): Record<string, string> {
  const db = readSiteCopyDb();
  return mergePageCopy(pageId, db.pages[pageId]);
}

export function getPageCopy(field: string, pageId: SiteCopyPageId): string {
  return resolvePageCopy(pageId)[field] ?? "";
}

export function listSiteCopySnapshots(): SiteCopyPageSnapshot[] {
  const db = readSiteCopyDb();
  return SITE_COPY_PAGES.map((page) => {
    const defaults = getSiteCopyDefaults(page.id);
    const overrides = db.pages[page.id] ?? {};
    const resolved = mergePageCopy(page.id, overrides);
    return {
      id: page.id,
      label: page.label,
      path: page.path,
      fields: page.fields.map((field) => {
        const defaultValue = defaults[field.key] ?? "";
        const value = resolved[field.key] ?? defaultValue;
        const overridden =
          typeof overrides[field.key] === "string" && overrides[field.key]!.trim().length > 0;
        return { ...field, defaultValue, value, overridden };
      }),
    };
  });
}

export function getSiteCopySnapshot(pageId: SiteCopyPageId): SiteCopyPageSnapshot {
  const all = listSiteCopySnapshots();
  const snap = all.find((p) => p.id === pageId);
  if (!snap) throw new Error(`Unknown site copy page: ${pageId}`);
  return snap;
}

export function updatePageCopy(
  pageId: SiteCopyPageId,
  fields: Record<string, string>,
): SiteCopyPageSnapshot {
  getSiteCopyPageDef(pageId);
  const defaults = getSiteCopyDefaults(pageId);
  const allowed = new Set(Object.keys(defaults));
  const db = readSiteCopyDb();
  const next: SiteCopyPageOverrides = { ...(db.pages[pageId] ?? {}) };

  for (const [key, raw] of Object.entries(fields)) {
    if (!allowed.has(key)) continue;
    const value = typeof raw === "string" ? raw : "";
    if (!value.trim() || value === defaults[key]) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }

  if (Object.keys(next).length === 0) {
    delete db.pages[pageId];
  } else {
    db.pages[pageId] = next;
  }
  db.updatedAt = new Date().toISOString();
  writeSiteCopyDb(db);
  return getSiteCopySnapshot(pageId);
}

export function resetPageCopy(pageId: SiteCopyPageId): SiteCopyPageSnapshot {
  getSiteCopyPageDef(pageId);
  const db = readSiteCopyDb();
  delete db.pages[pageId];
  db.updatedAt = new Date().toISOString();
  writeSiteCopyDb(db);
  return getSiteCopySnapshot(pageId);
}

export function resetFieldCopy(pageId: SiteCopyPageId, fieldKey: string): SiteCopyPageSnapshot {
  getSiteCopyPageDef(pageId);
  const defaults = getSiteCopyDefaults(pageId);
  if (!(fieldKey in defaults)) {
    throw new Error(`Unknown field ${fieldKey} on page ${pageId}`);
  }
  const db = readSiteCopyDb();
  const page = { ...(db.pages[pageId] ?? {}) };
  delete page[fieldKey];
  if (Object.keys(page).length === 0) {
    delete db.pages[pageId];
  } else {
    db.pages[pageId] = page;
  }
  db.updatedAt = new Date().toISOString();
  writeSiteCopyDb(db);
  return getSiteCopySnapshot(pageId);
}

export function parseSiteCopyPageId(value: unknown): SiteCopyPageId | null {
  if (typeof value !== "string") return null;
  return isSiteCopyPageId(value) ? value : null;
}

/** Typed helpers for marketing components. */
export function getHomeSiteCopy() {
  const c = resolvePageCopy("home");
  return {
    hero: {
      kicker: c["hero.kicker"],
      headline: c["hero.headline"],
      subheadline: c["hero.subheadline"],
      primaryCta: c["hero.primaryCta"],
      secondaryCta: c["hero.secondaryCta"],
    },
    about: {
      kicker: c["about.kicker"],
      title: c["about.title"],
      whoWeAre: c["about.whoWeAre"],
      mission: c["about.mission"],
      vision: c["about.vision"],
      history: c["about.history"],
      values: [0, 1, 2, 3].map((i) => ({
        title: c[`about.values.${i}.title`] ?? "",
        body: c[`about.values.${i}.body`] ?? "",
      })),
      whyChoose: [0, 1, 2, 3, 4, 5, 6].map((i) => c[`about.whyChoose.${i}`] ?? ""),
    },
  };
}

export function getAtplSiteCopy() {
  const c = resolvePageCopy("atpl");
  return {
    hero: {
      kicker: c["hero.kicker"],
      headline: c["hero.headline"],
      subheadline: c["hero.subheadline"],
      primaryCta: c["hero.primaryCta"],
      secondaryCta: c["hero.secondaryCta"],
    },
    overview: {
      title: c["overview.title"],
      body: c["overview.body"],
    },
  };
}

export function getOnlineCoursesHubSiteCopy() {
  const c = resolvePageCopy("online-courses");
  return {
    kicker: c["hub.kicker"],
    title: c["hub.title"],
    intro: c["hub.intro"],
    locationsLabel: c["hub.locationsLabel"],
  };
}

export function getProgrammePageSiteCopy(
  pageId: "online-courses-basics" | "online-courses-ppl" | "online-courses-elp",
) {
  const c = resolvePageCopy(pageId);
  return {
    kicker: c.kicker,
    title: c.title,
    intro: c.intro,
  };
}

export function getFlightpathSiteCopy() {
  const c = resolvePageCopy("flightpath");
  return {
    kicker: c.kicker,
    title: c.title,
    subtitle: c.subtitle,
    intro: c.intro,
  };
}

export function getLiveSiteCopy() {
  const c = resolvePageCopy("live");
  return {
    kicker: c.kicker,
    title: c.title,
    subtitle: c.subtitle,
    intro: c.intro,
  };
}

export function getContactSiteCopy() {
  const c = resolvePageCopy("contact");
  return {
    kicker: c.kicker,
    title: c.title,
    intro: c.intro,
  };
}
