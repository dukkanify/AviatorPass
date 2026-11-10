import { NextResponse } from "next/server";

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { PERMISSIONS } from "@/constants/permissions";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { UploadSecurityError } from "@/lib/security/upload";
import { UploadBackendError } from "@/lib/ops/upload-backend";
import { logActivity } from "@/services/auth/activity-log";
import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import {
  addHomeSliderSlide,
  deleteHomeSliderSlide,
  getHomeSliderAdmin,
  HomeSliderError,
  reorderHomeSliderSlides,
  updateHomeSliderSettings,
  updateHomeSliderSlide,
} from "@/services/marketing/home-slider-service";
import { getPlatformSettings } from "@/services/settings/settings-service";

function sliderErrorResponse(error: unknown) {
  if (error instanceof HomeSliderError) {
    return NextResponse.json(
      { success: false, data: null, error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof UploadSecurityError || error instanceof UploadBackendError) {
    return NextResponse.json(
      { success: false, data: null, error: error.message },
      { status: "status" in error ? error.status : 400 },
    );
  }
  return authErrorResponse(error);
}

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    return NextResponse.json({
      success: true,
      data: getHomeSliderAdmin(),
      error: null,
    });
  } catch (error) {
    return sliderErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    const user = await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const contentType = request.headers.get("content-type") ?? "";
    const settings = getPlatformSettings();

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const imageUrl = form.get("imageUrl") ? String(form.get("imageUrl")) : undefined;
      const slide = await addHomeSliderSlide({
        file: file instanceof File ? file : undefined,
        imageUrl,
        altText: form.get("altText") ? String(form.get("altText")) : undefined,
        actorId: user.id,
        maxBytes: settings.security.maxUploadSizeMb * 1024 * 1024,
        allowedMimeTypes: settings.security.allowedFileTypes,
      });
      await logActivity({
        actorId: user.id,
        action: ACTIVITY_ACTIONS.SETTINGS_UPDATE,
        entityType: "home_slider",
        entityId: slide.id,
        metadata: { event: "add_slide", imageUrl: slide.imageUrl },
      });
      return NextResponse.json({ success: true, data: getHomeSliderAdmin(), error: null });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action ?? "");

    if (action === "update_slide") {
      const id = String(body?.id ?? "");
      updateHomeSliderSlide(id, {
        altText: body?.altText != null ? String(body.altText) : undefined,
        imageUrl: body?.imageUrl != null ? String(body.imageUrl) : undefined,
        active: typeof body?.active === "boolean" ? body.active : undefined,
        sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : undefined,
      });
    } else if (action === "reorder") {
      const orderedIds = Array.isArray(body?.orderedIds)
        ? body.orderedIds.map((id) => String(id))
        : [];
      reorderHomeSliderSlides(orderedIds);
    } else if (action === "settings") {
      updateHomeSliderSettings({
        intervalMs: typeof body?.intervalMs === "number" ? body.intervalMs : undefined,
      });
    } else if (action === "delete") {
      deleteHomeSliderSlide(String(body?.id ?? ""));
    } else if (action === "add_url") {
      await addHomeSliderSlide({
        imageUrl: body?.imageUrl ? String(body.imageUrl) : undefined,
        altText: body?.altText ? String(body.altText) : undefined,
        actorId: user.id,
        maxBytes: settings.security.maxUploadSizeMb * 1024 * 1024,
        allowedMimeTypes: settings.security.allowedFileTypes,
      });
    } else {
      return NextResponse.json(
        { success: false, data: null, error: "Unknown action" },
        { status: 400 },
      );
    }

    await logActivity({
      actorId: user.id,
      action: ACTIVITY_ACTIONS.SETTINGS_UPDATE,
      entityType: "home_slider",
      entityId: String(body?.id ?? "collection"),
      metadata: { event: action },
    });

    return NextResponse.json({ success: true, data: getHomeSliderAdmin(), error: null });
  } catch (error) {
    return sliderErrorResponse(error);
  }
}
