"use client";

import { CalendarPlus, Users, Video } from "lucide-react";

import Link from "@/components/ui/app-link";

import { PageHeader } from "@/components/shared/page-header";
import {
  StatCard,
  ChartCard,
  BarsChart,
  QuickActions,
  CalendarWidget,
  type SeriesPoint,
  type CalendarEvent,
} from "@/components/dashboard";

interface InstructorDashboardViewProps {
  overview: {
    myCourses: number;
    todaysClasses: number;
    upcomingClasses: number;
    students: number;
    assignments: number;
    quizzes: number;
    earnings: number;
    walletBalance: number;
  };
  attendance: SeriesPoint[];
  calendar: CalendarEvent[];
  firstLectures?: Array<{
    id: string;
    studentName: string;
    studentEmail: string;
    label: string | null;
    onTimetable: boolean;
    subjectTitle?: string;
    liveClassId?: string | null;
  }>;
}

function InstructorDashboardView({
  overview,
  attendance,
  calendar,
  firstLectures = [],
}: InstructorDashboardViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Instructor dashboard"
        description="Your live ATPL lectures, timetable, and assigned students."
        breadcrumbs={[{ label: "Instructor" }, { label: "Dashboard" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today's classes" value={overview.todaysClasses} icon={Video} />
        <StatCard label="Upcoming classes" value={overview.upcomingClasses} icon={CalendarPlus} />
        <StatCard label="Students" value={overview.students} icon={Users} />
      </div>

      {firstLectures.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg tracking-tight">
              First lectures assigned by TKI 1
            </h2>
            <Link href="/instructor/schedule" className="text-sm text-primary hover:underline">
              Open timetable
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {firstLectures.map((lecture) => (
              <li key={lecture.id} className="border-b border-border/50 pb-2 last:border-0">
                <p className="font-medium">{lecture.studentName}</p>
                <p className="text-muted-foreground">
                  {lecture.subjectTitle ? `${lecture.subjectTitle} · ` : ""}
                  {lecture.label ?? "Time confirmed"}
                  {lecture.onTimetable ? " · on timetable" : ""}
                </p>
                {lecture.liveClassId ? (
                  <p className="mt-1 flex flex-wrap gap-3">
                    <Link
                      href={`/join/${lecture.liveClassId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Join Zoom
                    </Link>
                    <Link
                      href={`/instructor/classes/${lecture.liveClassId}`}
                      className="text-primary hover:underline"
                    >
                      Performance and next session
                    </Link>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Attendance">
          <BarsChart data={attendance} />
        </ChartCard>
        <CalendarWidget events={calendar} title="My schedule" />
      </div>

      <QuickActions
        actions={[
          { label: "Live classes", href: "/instructor/classes", icon: Video },
          { label: "Open timetable", href: "/instructor/schedule", icon: CalendarPlus },
          { label: "Students", href: "/instructor/students", icon: Users },
        ]}
      />
    </div>
  );
}

export { InstructorDashboardView };
