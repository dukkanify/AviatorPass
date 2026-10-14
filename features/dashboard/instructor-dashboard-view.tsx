"use client";

import { CalendarPlus, Users, Video } from "lucide-react";

import Link from "@/components/ui/app-link";
import { MarkSubjectCompleteButton } from "@/features/classes/components/mark-subject-complete-button";

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
    studentId: string;
    windowEnded: boolean;
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
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg tracking-tight">
                First lectures assigned by TKI 1
              </h2>
              <p className="text-sm text-muted-foreground">
                One card per lecture. Student, subject, and time stay separate.
              </p>
            </div>
            <Link href="/instructor/schedule" className="text-sm text-primary hover:underline">
              Open timetable
            </Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {firstLectures.map((lecture) => (
              <li key={lecture.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Student
                    </p>
                    <p className="font-medium">{lecture.studentName}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {lecture.windowEnded
                      ? "Time ended"
                      : lecture.onTimetable
                        ? "On timetable"
                        : "Assigned"}
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Subject
                  </p>
                  <p className="font-medium">{lecture.subjectTitle || "ATPL lecture"}</p>
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    When
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lecture.label ?? "Time confirmed"}
                  </p>
                </div>
                {lecture.liveClassId ? (
                  <div className="mt-4 space-y-2">
                    {lecture.windowEnded ? (
                      <p className="text-sm text-muted-foreground">
                        This lecture time has ended. Mark the subject complete so it does not open
                        again. TKI 1 books the next subject.
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link
                        href={`/join/${lecture.liveClassId}`}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                      >
                        Join Zoom
                      </Link>
                      {lecture.windowEnded ? (
                        <MarkSubjectCompleteButton
                          liveClassId={lecture.liveClassId}
                          studentId={lecture.studentId}
                        />
                      ) : null}
                      <Link
                        href={`/instructor/classes/${lecture.liveClassId}`}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium"
                      >
                        Performance and next session
                      </Link>
                    </div>
                  </div>
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
