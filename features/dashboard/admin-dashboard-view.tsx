"use client";

import dynamic from "next/dynamic";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  Layers,
  Megaphone,
  UserPlus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  StatCard,
  ChartCard,
  BarsChart,
  AreaTrendChart,
  QuickActions,
  RecentActivity,
  type SeriesPoint,
  type ActivityItem,
  type CalendarEvent,
} from "@/components/dashboard";

const CalendarWidget = dynamic(
  () =>
    import("@/components/dashboard/calendar-widget").then((m) => ({
      default: m.CalendarWidget,
    })),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden />,
  },
);

interface AdminDashboardViewProps {
  journey: {
    pendingInstructor: number;
    schedulingRequired: number;
    confirmedLectures: number;
  };
  overview: {
    students: number;
    instructors: number;
    courses: number;
    liveClasses: number;
    pendingApprovals: number;
    communityReports: number;
    blogActivity: number;
  };
  growth: SeriesPoint[];
  enrollments: SeriesPoint[];
  activity: ActivityItem[];
  calendar: CalendarEvent[];
}

function AdminDashboardView({
  journey,
  overview,
  growth,
  enrollments,
  activity,
  calendar,
}: AdminDashboardViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin dashboard"
        description="The same ATPL lecture queue as TKI 1 and Super Admin, plus academy operations."
        breadcrumbs={[{ label: "Admin" }, { label: "Dashboard" }]}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
          ATPL lecture queue
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Pending instructor"
            value={journey.pendingInstructor}
            icon={Users}
            hint="Paid students waiting for TKI 1"
            href="/admin/students"
          />
          <StatCard
            label="Scheduling Required"
            value={journey.schedulingRequired}
            icon={GraduationCap}
            hint="Instructor could not book the next lecture"
            href="/admin/schedule"
          />
          <StatCard
            label="Confirmed lectures"
            value={journey.confirmedLectures}
            icon={Layers}
            hint="On the student timetable"
            href="/admin/schedule"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground">Academy</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Students"
            value={overview.students}
            icon={Users}
            href="/admin/students"
          />
          <StatCard
            label="Instructors"
            value={overview.instructors}
            icon={GraduationCap}
            href="/admin/instructors"
          />
          <StatCard
            label="Courses"
            value={overview.courses}
            icon={BookOpen}
            href="/admin/courses"
          />
          <StatCard
            label="Live now"
            value={overview.liveClasses}
            icon={Layers}
            hint="In session right now"
            href="/admin/classes"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Pending approvals"
            value={overview.pendingApprovals}
            icon={ClipboardList}
            hint="Accounts awaiting review"
            href="/admin/users?status=pending"
          />
          <StatCard
            label="Moderation log"
            value={overview.communityReports}
            icon={Megaphone}
            hint="Recent flagged items"
            href="/admin/moderation"
          />
          <StatCard
            label="Published posts"
            value={overview.blogActivity}
            icon={BookOpen}
            hint="Live on the blog"
            href="/admin/blog"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Student growth">
          <AreaTrendChart data={growth} />
        </ChartCard>
        <ChartCard title="Enrollments by track">
          <BarsChart data={enrollments} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickActions
          actions={[
            { label: "Add student", href: "/admin/students?create=1", icon: UserPlus },
            { label: "Add instructor", href: "/admin/instructors?create=1", icon: GraduationCap },
            { label: "Schedule class", href: "/admin/classes", icon: Layers },
            { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
          ]}
        />
        <div className="space-y-4">
          <CalendarWidget events={calendar} />
          <RecentActivity items={activity} />
        </div>
      </div>
    </div>
  );
}

export { AdminDashboardView };
