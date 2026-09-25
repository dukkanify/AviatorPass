/**
 * Durable upload routing for AviatorPass.
 * Local public/uploads is ephemeral on Vercel — production must use
 * Vercel Blob (`BLOB_READ_WRITE_TOKEN`) or Supabase Storage.
 */

import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { isSupabaseConfigured } from "@/config/env";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { uploadFile as uploadToSupabase } from "@/services/storage/storage-service";
import type { StorageSettings } from "@/types/settings";

export type StorageProvider = StorageSettings["provider"];
export type UploadBackend = "local" | "supabase" | "vercel_blob" | "unavailable";

export class UploadBackendError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "UploadBackendError";
    this.status = status;
  }
}

export function isEphemeralUploadHost(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.VERCEL) || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

export function isBlobConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function resolveUploadBackend(input: {
  provider: StorageProvider;
  supabaseConfigured: boolean;
  env?: Record<string, string | undefined>;
}): UploadBackend {
  const env = input.env ?? process.env;
  const blobReady = isBlobConfigured(env);
  const ephemeral = isEphemeralUploadHost(env);

  if (input.provider === "supabase") {
    return input.supabaseConfigured ? "supabase" : "unavailable";
  }
  if (input.provider === "vercel_blob") {
    return blobReady ? "vercel_blob" : "unavailable";
  }

  if (ephemeral) {
    if (blobReady) return "vercel_blob";
    if (input.supabaseConfigured) return "supabase";
    return "unavailable";
  }
  return "local";
}

export function inspectStorageHealth(input: {
  provider: StorageProvider;
  supabaseConfigured: boolean;
  env?: Record<string, string | undefined>;
}): { status: "pass" | "warn" | "fail"; backend: UploadBackend; detail: string } {
  const backend = resolveUploadBackend(input);
  const ephemeral = isEphemeralUploadHost(input.env);
  if (backend === "vercel_blob") {
    return {
      status: "pass",
      backend,
      detail: "Vercel Blob (BLOB_READ_WRITE_TOKEN) — durable uploads",
    };
  }
  if (backend === "supabase") {
    return {
      status: "pass",
      backend,
      detail: `Supabase Storage · provider ${input.provider}`,
    };
  }
  if (backend === "local") {
    return {
      status: "pass",
      backend,
      detail: "Local public/uploads (single-node / development)",
    };
  }
  return {
    status: ephemeral ? "fail" : "warn",
    backend,
    detail:
      "Local public/uploads is ephemeral on Vercel. Set BLOB_READ_WRITE_TOKEN or configure Supabase Storage.",
  };
}

export function getStorageHealthCheck(): {
  status: "pass" | "warn" | "fail";
  backend: UploadBackend;
  detail: string;
} {
  const settings = getPlatformSettings();
  return inspectStorageHealth({
    provider: settings.storage.provider,
    supabaseConfigured: isSupabaseConfigured(),
  });
}

export async function putUploadedFile(input: {
  relativePath: string;
  bytes: Buffer;
  contentType: string;
}): Promise<{ publicUrl: string; backend: UploadBackend; storagePath: string }> {
  const settings = getPlatformSettings();
  const backend = resolveUploadBackend({
    provider: settings.storage.provider,
    supabaseConfigured: isSupabaseConfigured(),
  });
  const relativePath = input.relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!relativePath || relativePath.includes("..")) {
    throw new UploadBackendError("Invalid upload path", 400);
  }

  if (backend === "unavailable") {
    throw new UploadBackendError(
      "Durable storage is not configured. Set BLOB_READ_WRITE_TOKEN (Vercel Blob) or Supabase Storage for production uploads.",
    );
  }

  if (backend === "local") {
    const abs = path.join(process.cwd(), "public", "uploads", relativePath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, input.bytes);
    return { publicUrl: `/uploads/${relativePath}`, backend, storagePath: abs };
  }

  if (backend === "supabase") {
    const file = new File([new Uint8Array(input.bytes)], path.basename(relativePath), {
      type: input.contentType,
    });
    const result = await uploadToSupabase(relativePath, file, settings.storage.supabaseBucket);
    if (!result.success || !result.data) {
      throw new UploadBackendError(result.error ?? "Supabase upload failed");
    }
    return {
      publicUrl: result.data.publicUrl ?? result.data.path,
      backend,
      storagePath: result.data.path,
    };
  }

  const blob = await putVercelBlob(`aep-uploads/${relativePath}`, input.bytes, input.contentType);
  return { publicUrl: blob.url, backend: "vercel_blob", storagePath: blob.pathname };
}

function isPrivateBlobStoreError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot use public access on a private store/i.test(message);
}

export async function putVercelBlob(
  pathname: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const { put } = await import("@vercel/blob");
  const options = { contentType, addRandomSuffix: false as const };
  try {
    return await put(pathname, bytes, { ...options, access: "public" });
  } catch (error) {
    if (!isPrivateBlobStoreError(error)) {
      throw new UploadBackendError(
        error instanceof Error ? error.message : "Vercel Blob upload failed",
        503,
      );
    }
    return await put(pathname, bytes, { ...options, access: "private" });
  }
}
