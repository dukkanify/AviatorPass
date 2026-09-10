import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { listHistory } from "@/services/learning/history-service";
import {
  deriveStudentType,
  ensureCourseOnboardingNotification,
  listCourseOffers,
} from "@/services/learning/course-offers-service";
import { learningErrorResponse } from "@/app/api/learning/_utils";

export async function GET() {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_ENROLLED);
    const hints = listHistory(user.id, { limit: 12 }).map((row) =>
      [row.title, row.description, row.type].filter(Boolean).join(" "),
    );
    const data = listCourseOffers({
      userId: user.id,
      countryCode: user.countryCode,
      activityHints: hints,
      studentType: deriveStudentType({
        profileComplete: user.profileComplete,
        createdAt: user.createdAt,
      }),
    });
    if (!data.hasEnrollments) {
      await ensureCourseOnboardingNotification(user.id);
    }
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return learningErrorResponse(error);
  }
}
