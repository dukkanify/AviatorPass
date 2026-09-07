/**
 * Route-level Zoom OAuth guards (instructor ownership).
 */

import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";
import { requireAuth, requirePermission } from "@/services/auth/guards";
import { assertPermission } from "@/services/auth/permissions";
import { assertCanManageOwnZoom } from "@/services/zoom/policy";
import type { UserProfile } from "@/types";

export async function requireZoomInstructor(): Promise<UserProfile> {
  const user = await requireAuth();
  if (user.role === ROLES.INSTRUCTOR || user.role === ROLES.CHIEF_GROUND_INSTRUCTOR) {
    assertPermission(user, PERMISSIONS.ZOOM_SESSIONS);
  } else {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
  }
  assertCanManageOwnZoom(user);
  return user;
}
