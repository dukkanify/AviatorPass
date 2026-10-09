import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { ensureConfirmedFirstLectureOnTimetable } from "@/services/cgi/journey-service";
import { learningErrorResponse } from "@/app/api/learning/_utils";
import type { LearningCalendarItem } from "@/types/learning";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_ENROLLED);
    const schedule = await ensureConfirmedFirstLectureOnTimetable(user.id, user.email);
    const data: LearningCalendarItem[] =
      schedule.confirmedFirstLectureAt && !schedule.scheduleProvisional
        ? [
            {
              id: `class-${schedule.firstLectureLiveClassId ?? "first-lecture"}`,
              title: schedule.firstLectureSubjectTitle ?? "First lecture",
              type: "live_class",
              startsAt: schedule.confirmedFirstLectureAt,
              endsAt: null,
              status: "upcoming",
              href: "/student/schedule",
              courseId: null,
            },
          ]
        : [];
    return NextResponse.json({
      success: true,
      data,
      error: null,
    });
  } catch (error) {
    return learningErrorResponse(error);
  }
}
