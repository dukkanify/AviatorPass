import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { prepareReviewerClassroom } from "@/services/zoom/reviewer-classroom";

/** Super Admin only. Creates the isolated reviewer classroom after personal Zoom authorization. */
export async function POST() {
  try {
    const actor = await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const result = await prepareReviewerClassroom(actor.id);
    const status = result.ready ? 200 : 409;
    return NextResponse.json(
      {
        success: result.ready,
        data: result.ready ? result : null,
        error: result.ready ? null : result.message,
        block: result.block,
      },
      { status },
    );
  } catch (error) {
    return classErrorResponse(error);
  }
}
