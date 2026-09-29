import { NextResponse } from "next/server";

import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import { courseErrorResponse } from "@/app/api/courses/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { getRequestContext, requirePermission } from "@/services/auth/guards";
import {
  ensureOfficialPackageSubject,
  updateAtplLandingSubject,
} from "@/services/marketing/atpl-subjects-service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_MANAGE);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const code = String(body?.code ?? "").trim();
    const official = ATPL_COMPLETE_PACKAGE_SUBJECTS.find((item) => item.code === code);
    if (!official) {
      return NextResponse.json(
        { success: false, data: null, error: "Unknown ATPL subject" },
        { status: 400 },
      );
    }
    const ctx = getRequestContext(request);
    const row = await ensureOfficialPackageSubject(official.code, { actorId: user.id, ...ctx });
    const subject = await updateAtplLandingSubject({
      id: row.id,
      patch: {
        title: official.title,
        code: official.code,
        shortDescription:
          body?.shortDescription != null ? String(body.shortDescription) : row.shortDescription,
        imageUrl:
          body?.imageUrl !== undefined
            ? body.imageUrl
              ? String(body.imageUrl)
              : null
            : row.imageUrl,
      },
      actorId: user.id,
      ...ctx,
    });
    return NextResponse.json({ success: true, data: subject, error: null });
  } catch (error) {
    return courseErrorResponse(error);
  }
}
