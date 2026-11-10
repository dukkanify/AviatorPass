/**
 * Homepage hero slider — public reads + Super Admin mutations.
 */

import { generateId } from "@/lib/security/crypto";
import { putUploadedFile, UploadBackendError } from "@/lib/ops/upload-backend";
import { validateUpload, virusScanHook, UploadSecurityError } from "@/lib/security/upload";
import { readHomeSliderDb, writeHomeSliderDb } from "@/services/marketing/home-slider-store";
import type { HomeSliderDatabase, HomeSliderSlide } from "@/types/home-slider";

export class HomeSliderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HomeSliderError";
    this.status = status;
  }
}

export function getHomeSliderAdmin(): HomeSliderDatabase {
  return readHomeSliderDb();
}

export function listActiveHomeSliderSlides(): HomeSliderSlide[] {
  return readHomeSliderDb()
    .slides.filter((slide) => slide.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getHomeSliderIntervalMs(): number {
  return readHomeSliderDb().intervalMs;
}

export function updateHomeSliderSettings(input: { intervalMs?: number }): HomeSliderDatabase {
  return writeHomeSliderDb((db) => {
    if (typeof input.intervalMs === "number") {
      if (!Number.isFinite(input.intervalMs) || input.intervalMs < 2500) {
        throw new HomeSliderError("Interval must be at least 2.5 seconds");
      }
      db.intervalMs = Math.round(input.intervalMs);
    }
  });
}

export function updateHomeSliderSlide(
  id: string,
  patch: Partial<Pick<HomeSliderSlide, "altText" | "active" | "sortOrder" | "imageUrl">>,
): HomeSliderSlide {
  let saved: HomeSliderSlide | null = null;
  writeHomeSliderDb((db) => {
    const row = db.slides.find((slide) => slide.id === id);
    if (!row) throw new HomeSliderError("Slide not found", 404);
    if (patch.altText != null) row.altText = String(patch.altText).trim() || row.altText;
    if (patch.imageUrl != null) {
      const next = String(patch.imageUrl).trim();
      if (!next) throw new HomeSliderError("Image URL is required");
      row.imageUrl = next;
    }
    if (typeof patch.active === "boolean") row.active = patch.active;
    if (typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
      row.sortOrder = Math.round(patch.sortOrder);
    }
    row.updatedAt = new Date().toISOString();
    saved = { ...row };
    db.slides.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  });
  if (!saved) throw new HomeSliderError("Slide not found", 404);
  return saved;
}

export function reorderHomeSliderSlides(orderedIds: string[]): HomeSliderDatabase {
  return writeHomeSliderDb((db) => {
    const byId = new Map(db.slides.map((slide) => [slide.id, slide]));
    const next: HomeSliderSlide[] = [];
    orderedIds.forEach((id, index) => {
      const row = byId.get(id);
      if (!row) return;
      row.sortOrder = index;
      row.updatedAt = new Date().toISOString();
      next.push(row);
      byId.delete(id);
    });
    for (const leftover of byId.values()) {
      leftover.sortOrder = next.length;
      next.push(leftover);
    }
    db.slides = next;
  });
}

export function deleteHomeSliderSlide(id: string): void {
  writeHomeSliderDb((db) => {
    if (!db.slides.some((slide) => slide.id === id)) {
      throw new HomeSliderError("Slide not found", 404);
    }
    if (db.slides.length <= 1) {
      throw new HomeSliderError("Keep at least one slide on the homepage hero", 400);
    }
    db.slides = db.slides.filter((slide) => slide.id !== id);
    db.slides.forEach((slide, index) => {
      slide.sortOrder = index;
    });
  });
}

export async function addHomeSliderSlide(input: {
  file?: File;
  imageUrl?: string;
  altText?: string;
  actorId: string | null;
  maxBytes: number;
  allowedMimeTypes: string[];
}): Promise<HomeSliderSlide> {
  let imageUrl = input.imageUrl?.trim() || "";
  if (input.file) {
    imageUrl = await uploadSliderImage({
      file: input.file,
      maxBytes: input.maxBytes,
      allowedMimeTypes: input.allowedMimeTypes,
    });
  }
  if (!imageUrl) throw new HomeSliderError("Upload an image or provide an image URL");

  let created!: HomeSliderSlide;
  writeHomeSliderDb((db) => {
    const stamp = new Date().toISOString();
    created = {
      id: generateId(),
      imageUrl,
      altText: input.altText?.trim() || "Homepage slide",
      sortOrder: db.slides.length,
      active: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.slides.push(created);
  });
  return created;
}

async function uploadSliderImage(input: {
  file: File;
  maxBytes: number;
  allowedMimeTypes: string[];
}): Promise<string> {
  let safeName: string;
  let mimeType: string;
  try {
    const validated = validateUpload({
      fileName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      maxBytes: input.maxBytes,
      allowedMimeTypes: input.allowedMimeTypes.filter((type) => type !== "image/svg+xml"),
      allowSvg: false,
    });
    safeName = validated.safeName;
    mimeType = validated.mimeType;
  } catch (error) {
    if (error instanceof UploadSecurityError) throw error;
    throw error;
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const scan = await virusScanHook(buffer);
  if (!scan.clean) throw new UploadSecurityError("File failed security scan");

  const filename = `${generateId().slice(0, 12)}-${safeName}`;
  try {
    const stored = await putUploadedFile({
      relativePath: `home-slider/${filename}`,
      bytes: buffer,
      contentType: mimeType,
    });
    return stored.publicUrl;
  } catch (error) {
    if (error instanceof UploadBackendError) throw error;
    throw new UploadBackendError("Could not store slider image");
  }
}
