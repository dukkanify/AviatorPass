import { NextResponse } from "next/server";

import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";
import { listUsersByRole } from "@/services/dashboard/metrics";
import { getZoomOAuthPublicDiagnostics, isZoomOAuthConfigured } from "@/services/zoom/config";
import { listInstructorZoomConnectionSummaries } from "@/services/zoom/oauth-service";
import { publicIntegrationView } from "@/services/zoom/policy";

/** Admin view of instructor Zoom connection status — never returns tokens. */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE);
    const instructors = listUsersByRole(ROLES.INSTRUCTOR);
    const cgi = listUsersByRole(ROLES.CHIEF_GROUND_INSTRUCTOR);
    const byUser = new Map(
      listInstructorZoomConnectionSummaries().map((row) => [row.userId, row] as const),
    );
    const oauthConfigured = isZoomOAuthConfigured();
    const oauth = getZoomOAuthPublicDiagnostics();

    const data = [...instructors, ...cgi].map((user) => {
      const summary = byUser.get(user.id);
      const view = publicIntegrationView(user.id, oauthConfigured);
      return {
        userId: user.id,
        instructorName: user.fullName || user.email,
        instructorEmail: user.email,
        connected: summary?.connected ?? view.connected,
        status: summary?.status ?? view.status,
        zoomEmail: summary?.zoomEmail ?? view.zoomEmail,
        lastSyncAt: summary?.lastSyncAt ?? view.lastSyncAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        oauthConfigured,
        /** Non-secret: exact redirect_uri production sends to Zoom (for Marketplace matching). */
        oauthRedirectUri: oauth.redirectUri,
        /** Non-secret: last 4 of Client ID so Admin can match Dev vs Prod credentials. */
        oauthClientIdSuffix: oauth.clientIdSuffix,
        instructors: data,
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
