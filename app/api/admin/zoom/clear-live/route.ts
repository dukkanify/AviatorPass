import { NextResponse } from "next/server";

import { classErrorResponse } from "@/app/api/classes/_utils";
import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { clearZoomHostLiveMeetings } from "@/services/classes/zoom-service";

/** Super Admin recovery: end leftover live Zoom meetings on the classroom host. */
export async function POST(request: Request) {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const body = (await request.json().catch(() => ({}))) as {
      keepMeetingNumber?: string;
      force?: boolean;
      instructorUserId?: string;
      endMeetingNumbers?: string[];
    };
    const result = await clearZoomHostLiveMeetings({
      keepMeetingNumber: body.keepMeetingNumber,
      force: Boolean(body.force),
      instructorUserId: body.instructorUserId,
      endMeetingNumbers: Array.isArray(body.endMeetingNumbers)
        ? body.endMeetingNumbers.map(String)
        : undefined,
    });
    return NextResponse.json({ success: true, data: result, error: null });
  } catch (error) {
    return classErrorResponse(error);
  }
}
