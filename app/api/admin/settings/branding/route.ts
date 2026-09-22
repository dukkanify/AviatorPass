import { NextResponse } from "next/server";

import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import { PERMISSIONS } from "@/constants/permissions";
import { updatePlatformSettings, getPlatformSettings } from "@/services/settings/settings-service";
import { logActivity } from "@/services/auth/activity-log";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { generateId } from "@/lib/security/crypto";
import { validateUpload, virusScanHook, UploadSecurityError } from "@/lib/security/upload";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { writeOpsLog } from "@/services/ops/logging-service";
import { putUploadedFile, UploadBackendError } from "@/lib/ops/upload-backend";

const BRAND_KEYS = [
  "logoUrl",
  "darkLogoUrl",
  "faviconUrl",
  "loginBackgroundUrl",
  "loginIllustrationUrl",
  "openGraphImageUrl",
] as const;

type BrandKey = (typeof BRAND_KEYS)[number];

/**
 * Branding upload via the shared upload backend (local / Vercel Blob / Supabase).
 */
export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    const user = await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const form = await request.formData();
    const file = form.get("file");
    const key = String(form.get("key") ?? "") as BrandKey;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, data: null, error: "file is required" },
        { status: 400 },
      );
    }
    if (!BRAND_KEYS.includes(key)) {
      return NextResponse.json(
        { success: false, data: null, error: "Invalid branding key" },
        { status: 400 },
      );
    }

    const settings = getPlatformSettings();
    const maxBytes = settings.security.maxUploadSizeMb * 1024 * 1024;
    let safeName: string;
    try {
      const validated = validateUpload({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        maxBytes,
        allowedMimeTypes: settings.security.allowedFileTypes.filter((t) => t !== "image/svg+xml"),
        allowSvg: false,
      });
      safeName = validated.safeName;
    } catch (error) {
      if (error instanceof UploadSecurityError) {
        return NextResponse.json(
          { success: false, data: null, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const scan = await virusScanHook(buffer);
    if (!scan.clean) {
      return NextResponse.json(
        { success: false, data: null, error: "File failed security scan" },
        { status: 400 },
      );
    }

    const filename = `${key}-${generateId().slice(0, 12)}-${safeName}`;
    let publicUrl: string;
    try {
      const stored = await putUploadedFile({
        relativePath: `branding/${filename}`,
        bytes: buffer,
        contentType: file.type || "application/octet-stream",
      });
      publicUrl = stored.publicUrl;
    } catch (error) {
      if (error instanceof UploadBackendError) {
        return NextResponse.json(
          { success: false, data: null, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const next = await updatePlatformSettings({
      patch: { branding: { [key]: publicUrl } },
      actorId: user.id,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    await logActivity({
      actorId: user.id,
      action: ACTIVITY_ACTIONS.BRANDING_UPLOAD,
      entityType: "branding",
      entityId: key,
      metadata: { url: publicUrl, size: file.size, type: file.type },
    });
    writeOpsLog({
      level: "info",
      category: "security",
      message: `Branding upload ${key}`,
      userId: user.id,
      path: publicUrl,
    });

    return NextResponse.json({
      success: true,
      data: { url: publicUrl, key, settings: next.branding },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
