import { NextResponse } from "next/server";

import { courseErrorResponse } from "@/app/api/courses/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { getRequestContext, requirePermission } from "@/services/auth/guards";
import {
  createAtplLandingSubject,
  listAtplLandingSubjects,
} from "@/services/marketing/atpl-subjects-service";

export async function GET(request: Request) {
  try {
    await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const { searchParams } = new URL(request.url);
    const includeHidden = searchParams.get("includeHidden") === "1";
    const data = listAtplLandingSubjects({ includeHidden });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return courseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { success: false, data: null, error: "JSON body required" },
        { status: 400 },
      );
    }
    const ctx = getRequestContext(request);
    const subject = await createAtplLandingSubject(
      {
        code: body.code != null ? String(body.code) : "",
        title: String(body.title ?? ""),
        shortDescription: body.shortDescription != null ? String(body.shortDescription) : "",
        badgeLabel: body.badgeLabel != null ? String(body.badgeLabel) : undefined,
        imageUrl: body.imageUrl != null ? String(body.imageUrl) : null,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
        visible: body.visible != null ? Boolean(body.visible) : undefined,
      },
      { actorId: user.id, ...ctx },
    );
    return NextResponse.json({ success: true, data: subject, error: null }, { status: 201 });
  } catch (error) {
    return courseErrorResponse(error);
  }
}
