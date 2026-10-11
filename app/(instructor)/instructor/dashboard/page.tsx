import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PRIMARY_DEMO_EMAILS } from "@/constants/demo-accounts";
import { InstructorDashboardView } from "@/features/dashboard/instructor-dashboard-view";
import { routes } from "@/constants/routes";
import { ROLES } from "@/constants/roles";
import { newDashboardCorrelationId, safeDashboardQuery } from "@/lib/dashboard/safe-load";
import { getCurrentSession } from "@/services/auth/auth-service";
import { listAssignedFirstLectures } from "@/services/cgi/journey-service";
import { ensureDemoOpeningLecture } from "@/services/demo/platform-demo-seed";
import {
  getAttendanceSeries,
  getDashboardCalendarEvents,
  getInstructorOverview,
} from "@/services/dashboard/metrics";

export const metadata: Metadata = { title: "Instructor Dashboard" };

export default async function InstructorDashboardPage() {
  const { user } = await getCurrentSession();
  if (!user) redirect(routes.login);
  if (user.role !== ROLES.INSTRUCTOR && user.role !== ROLES.CHIEF_GROUND_INSTRUCTOR) {
    redirect(routes.accessDenied);
  }
  if (user.email === PRIMARY_DEMO_EMAILS.instructor) ensureDemoOpeningLecture();

  const correlationId = newDashboardCorrelationId();
  const base = {
    userId: user.id,
    role: user.role,
    correlationId,
    path: "/instructor/dashboard",
  };

  const overview = safeDashboardQuery({
    ...base,
    label: "getInstructorOverview",
    fallback: {
      myCourses: 0,
      todaysClasses: 0,
      upcomingClasses: 0,
      students: 0,
      assignments: 0,
      quizzes: 0,
      earnings: 0,
      walletBalance: 0,
    },
    run: () => getInstructorOverview(user.id),
  });

  return (
    <InstructorDashboardView
      overview={overview}
      attendance={safeDashboardQuery({
        ...base,
        label: "getAttendanceSeries",
        fallback: [],
        run: () => getAttendanceSeries(),
      })}
      calendar={safeDashboardQuery({
        ...base,
        label: "getDashboardCalendarEvents",
        fallback: [],
        run: () => getDashboardCalendarEvents(user),
      })}
      firstLectures={safeDashboardQuery({
        ...base,
        label: "listAssignedFirstLectures",
        fallback: [],
        run: () =>
          listAssignedFirstLectures({ instructorId: user.id }).filter(
            (lecture) => !lecture.studentEmail.trim().toLowerCase().endsWith(".test"),
          ),
      })}
    />
  );
}
