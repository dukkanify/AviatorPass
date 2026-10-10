import { NextResponse } from "next/server";

import { ROLES } from "@/constants/roles";
import { resolveDashboardScope } from "@/lib/security/dashboard-scope";
import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import {
  getAdminOverview,
  getAttendanceSeries,
  getDashboardCalendarEvents,
  getEarningsSeries,
  getEnrollmentSeries,
  getGrowthSeries,
  getInstructorOverview,
  getPlatformOverviewCounts,
  getProgressBreakdown,
  getRecentActivityFeed,
  getStudentOverview,
  getSuperAdminDashboardPayload,
} from "@/services/dashboard/metrics";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const scope = resolveDashboardScope(user.role, searchParams.get("scope"));

    if (scope === ROLES.STUDENT) {
      return NextResponse.json({
        success: true,
        data: {
          overview: getStudentOverview(user.id),
          calendar: [],
          activity: [],
          charts: {
            progress: getProgressBreakdown(user.id),
            attendance: [],
          },
        },
        error: null,
      });
    }

    if (scope === ROLES.SUPER_ADMIN) {
      const part = searchParams.get("part");
      if (part === "counts") {
        return NextResponse.json({
          success: true,
          data: {
            overview: getPlatformOverviewCounts(),
            calendar: [],
            activity: [],
            charts: {
              growth: [],
              revenue: [],
              enrollments: [],
              attendance: [],
            },
          },
          error: null,
        });
      }
      return NextResponse.json({
        success: true,
        data: getSuperAdminDashboardPayload(),
        error: null,
      });
    }

    const activity =
      scope === ROLES.INSTRUCTOR || scope === ROLES.CHIEF_GROUND_INSTRUCTOR
        ? getRecentActivityFeed(user.id)
        : getRecentActivityFeed();

    const calendar = getDashboardCalendarEvents(user);

    if (scope === ROLES.ADMIN) {
      return NextResponse.json({
        success: true,
        data: {
          overview: getAdminOverview(),
          calendar,
          activity,
          charts: {
            growth: getGrowthSeries(),
            enrollments: getEnrollmentSeries(),
            attendance: getAttendanceSeries(),
            progress: getProgressBreakdown(),
          },
        },
        error: null,
      });
    }

    if (scope === ROLES.INSTRUCTOR || scope === ROLES.CHIEF_GROUND_INSTRUCTOR) {
      return NextResponse.json({
        success: true,
        data: {
          overview: getInstructorOverview(user.id),
          calendar,
          activity,
          charts: {
            attendance: getAttendanceSeries(user.id),
            earnings: getEarningsSeries(),
            enrollments: getEnrollmentSeries(),
            progress: getProgressBreakdown(),
          },
        },
        error: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        overview: getStudentOverview(user.id),
        calendar,
        activity,
        charts: {
          progress: getProgressBreakdown(user.id),
          attendance: getAttendanceSeries(undefined, user.id),
        },
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
