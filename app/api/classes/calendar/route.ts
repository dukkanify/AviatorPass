import { NextResponse } from "next/server";

import { ROLES } from "@/constants/roles";
import { requireAuth } from "@/services/auth/guards";
import { ensureConfirmedFirstLectureOnTimetable } from "@/services/cgi/journey-service";
import { getAgendaForUser, getCalendarEventsForUser } from "@/services/classes/calendar-service";
import { classErrorResponse } from "@/app/api/classes/_utils";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    if (user.role === ROLES.STUDENT) {
      await ensureConfirmedFirstLectureOnTimetable(user.id, user.email);
    }
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "month";
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;

    if (view === "agenda") {
      return NextResponse.json({
        success: true,
        data: getAgendaForUser(user),
        error: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        view,
        events: getCalendarEventsForUser(user, { from, to }),
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
