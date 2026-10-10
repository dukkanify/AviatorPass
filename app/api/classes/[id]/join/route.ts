import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";
import { requireAuth } from "@/services/auth/guards";
import { assertPermission } from "@/services/auth/permissions";
import { getJoinInfoForUser } from "@/services/classes/class-service";
import { markJoin } from "@/services/classes/attendance-service";
import { ensureLiveMeetingForClass } from "@/services/classes/zoom-service";
import { classErrorResponse } from "@/app/api/classes/_utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    if (user.role === ROLES.STUDENT) assertPermission(user, PERMISSIONS.ZOOM_CLASSES);
    else if (user.role === ROLES.INSTRUCTOR) assertPermission(user, PERMISSIONS.ZOOM_SESSIONS);
    else assertPermission(user, PERMISSIONS.CLASSES_MANAGE);

    await ensureLiveMeetingForClass(id, user.id);
    const info = getJoinInfoForUser(id, user.id);
    return NextResponse.json({ success: true, data: info, error: null });
  } catch (error) {
    return classErrorResponse(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    if (user.role === ROLES.STUDENT) assertPermission(user, PERMISSIONS.ZOOM_CLASSES);
    else if (user.role === ROLES.INSTRUCTOR) assertPermission(user, PERMISSIONS.ZOOM_SESSIONS);
    else assertPermission(user, PERMISSIONS.CLASSES_MANAGE);

    await ensureLiveMeetingForClass(id, user.id);
    const info = getJoinInfoForUser(id, user.id);
    if (user.role === ROLES.STUDENT) {
      void markJoin({ liveClassId: id, studentId: user.id, actorId: user.id }).catch((error) => {
        console.error("[classes] markJoin failed; student can still enter the classroom", error);
      });
    }
    return NextResponse.json({ success: true, data: info, error: null });
  } catch (error) {
    return classErrorResponse(error);
  }
}
