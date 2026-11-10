/**
 * Homepage slider store (.data/aep-home-slider.json).
 */

import path from "path";

import { MARKETING_HERO_SRC } from "@/constants/marketing-hero";
import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import type { HomeSliderDatabase } from "@/types/home-slider";

function dataFile() {
  return path.join(dataDir(), "aep-home-slider.json");
}

function emptyDb(): HomeSliderDatabase {
  const stamp = new Date().toISOString();
  return {
    slides: [
      {
        id: "default-hero-aircraft",
        imageUrl: MARKETING_HERO_SRC,
        altText: "Aviator Pass aircraft hero",
        sortOrder: 0,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    intervalMs: 6000,
    updatedAt: stamp,
  };
}

function normalizeDb(raw: Partial<HomeSliderDatabase>): HomeSliderDatabase {
  const base = emptyDb();
  const slides = Array.isArray(raw.slides) ? raw.slides : base.slides;
  return {
    slides: slides
      .filter((slide) => slide && typeof slide.imageUrl === "string" && slide.imageUrl.trim())
      .map((slide, index) => ({
        id: String(slide.id || `slide-${index}`),
        imageUrl: String(slide.imageUrl).trim(),
        altText: String(slide.altText || "").trim() || "Homepage slide",
        sortOrder: typeof slide.sortOrder === "number" ? slide.sortOrder : index,
        active: slide.active !== false,
        createdAt: String(slide.createdAt || base.updatedAt),
        updatedAt: String(slide.updatedAt || base.updatedAt),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    intervalMs:
      typeof raw.intervalMs === "number" && raw.intervalMs >= 2500 ? raw.intervalMs : 6000,
    updatedAt: String(raw.updatedAt || base.updatedAt),
  };
}

function ensureStore(): HomeSliderDatabase {
  const raw = readJsonFile<Partial<HomeSliderDatabase>>(dataFile(), emptyDb);
  return normalizeDb(raw);
}

export function readHomeSliderDb(): HomeSliderDatabase {
  return ensureStore();
}

export function writeHomeSliderDb(mutator: (db: HomeSliderDatabase) => void): HomeSliderDatabase {
  const db = ensureStore();
  mutator(db);
  db.updatedAt = new Date().toISOString();
  writeJsonFile(dataFile(), db);
  return db;
}

export function resetHomeSliderDbForTests(): void {
  writeJsonFile(dataFile(), emptyDb());
}
