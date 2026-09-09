import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { getRequestContext, requirePermission } from "@/services/auth/guards";
import { reorderCategories } from "@/services/courses/category-service";
import { courseErrorResponse } from "@/app/api/courses/_utils";

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const ctx = getRequestContext(request);
    const data = await reorderCategories({ ids, actorId: user.id, ...ctx });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return courseErrorResponse(error);
  }
}
