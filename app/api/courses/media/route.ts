import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { getRequestContext, requireAuth } from "@/services/auth/guards";
import { hasPermission, PermissionError } from "@/services/auth/permissions";
import type { Role } from "@/constants/roles";
import { uploadCourseMedia, type CourseMediaKind } from "@/services/courses/media-service";
import {
  listMediaAssets,
  registerExistingMediaAsset,
} from "@/services/media-library/media-library-service";
import { courseErrorResponse } from "@/app/api/courses/_utils";

const KINDS: CourseMediaKind[] = ["thumbnail", "cover", "video", "attachment"];

function assertCanUseCourseMedia(role: Role) {
  if (
    hasPermission(role, PERMISSIONS.COURSES_MANAGE) ||
    hasPermission(role, PERMISSIONS.COURSES_OWN)
  ) {
    return;
  }
  throw new PermissionError("You do not have permission to perform this action", 403);
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    assertCanUseCourseMedia(user.role);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const context = searchParams.get("context") ?? "all";
    const assets = listMediaAssets({ q }).filter((asset) => {
      if (!asset.mimeType.startsWith("image/")) return false;
      if (context === "all" || context === "recent") return true;
      return asset.tags.some((tag) => tag === context || tag.startsWith(`${context}:`));
    });
    return NextResponse.json({
      success: true,
      data: context === "recent" ? assets.slice(0, 24) : assets,
      error: null,
    });
  } catch (error) {
    return courseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    assertCanUseCourseMedia(user.role);
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "attachment") as CourseMediaKind;
    const courseId = form.get("courseId") ? String(form.get("courseId")) : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, data: null, error: "file is required" },
        { status: 400 },
      );
    }
    if (!KINDS.includes(kind)) {
      return NextResponse.json(
        { success: false, data: null, error: "Invalid media kind" },
        { status: 400 },
      );
    }

    const ctx = getRequestContext(request);
    const result = await uploadCourseMedia({
      file,
      kind,
      courseId,
      actorId: user.id,
      ...ctx,
    });

    const context = String(form.get("context") ?? "course");
    try {
      registerExistingMediaAsset({
        title: file.name.replace(/\.[^.]+$/, ""),
        url: result.publicUrl,
        fileName: result.fileName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        tags: [context, kind, courseId ? `course:${courseId}` : "recent"],
        actorId: user.id,
      });
    } catch {
      // Course upload still succeeds if the library index is unavailable.
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...result,
          variants: {
            original: result.publicUrl,
            thumbnail: result.publicUrl,
            medium: result.publicUrl,
            large: result.publicUrl,
            webp: result.publicUrl,
          },
        },
        error: null,
      },
      { status: 201 },
    );
  } catch (error) {
    return courseErrorResponse(error);
  }
}
