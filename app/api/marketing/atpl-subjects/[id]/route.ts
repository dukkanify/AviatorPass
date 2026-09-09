import { NextResponse } from "next/server";

import { courseErrorResponse } from "@/app/api/courses/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { getRequestContext, requirePermission } from "@/services/auth/guards";
import {
  deleteAtplLandingSubject,
  updateAtplLandingSubject,
} from "@/services/marketing/atpl-subjects-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { success: false, data: null, error: "JSON body required" },
        { status: 400 },
      );
    }
    const ctx = getRequestContext(request);
    const subject = await updateAtplLandingSubject({
      id,
      patch: {
        code: body.code != null ? String(body.code) : undefined,
        title: body.title != null ? String(body.title) : undefined,
        shortDescription: body.shortDescription != null ? String(body.shortDescription) : undefined,
        badgeLabel: body.badgeLabel != null ? String(body.badgeLabel) : undefined,
        imageUrl:
          body.imageUrl !== undefined ? (body.imageUrl ? String(body.imageUrl) : null) : undefined,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
        visible: body.visible != null ? Boolean(body.visible) : undefined,
      },
      actorId: user.id,
      ...ctx,
    });
    return NextResponse.json({ success: true, data: subject, error: null });
  } catch (error) {
    return courseErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const { id } = await params;
    const ctx = getRequestContext(request);
    await deleteAtplLandingSubject({ id, actorId: user.id, ...ctx });
    return NextResponse.json({ success: true, data: { id }, error: null });
  } catch (error) {
    return courseErrorResponse(error);
  }
}
