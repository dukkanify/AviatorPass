"use client";

import * as React from "react";
import {
  BookOpen,
  CreditCard,
  DollarSign,
  GraduationCap,
  Layers,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  FileBarChart,
  Settings,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  StatCard,
  ChartCard,
  AreaTrendChart,
  LineTrendChart,
  BarsChart,
  QuickActions,
  RecentActivity,
  CalendarWidget,
  type SeriesPoint,
  type ActivityItem,
  type CalendarEvent,
} from "@/components/dashboard";
import { formatCurrency } from "@/utils/format";

const EMPTY_OVERVIEW = {
  totalStudents: 0,
  totalInstructors: 0,
  totalCourses: 0,
  activeClasses: 0,
  monthlyRevenue: 0,
  instructorWalletBalance: 0,
  pendingPayments: 0,
  platformGrowth: 0,
};

function SuperAdminDashboardView() {
  const [overview, setOverview] = React.useState(EMPTY_OVERVIEW);
  const [growth, setGrowth] = React.useState<SeriesPoint[]>([]);
  const [revenue, setRevenue] = React.useState<SeriesPoint[]>([]);
  const [enrollments, setEnrollments] = React.useState<SeriesPoint[]>([]);
  const [attendance, setAttendance] = React.useState<SeriesPoint[]>([]);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [calendar, setCalendar] = React.useState<CalendarEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    type MetricsJson = {
      success?: boolean;
      data?: {
        overview?: typeof EMPTY_OVERVIEW;
        calendar?: CalendarEvent[];
        activity?: ActivityItem[];
        charts?: {
          growth?: SeriesPoint[];
          revenue?: SeriesPoint[];
          enrollments?: SeriesPoint[];
          attendance?: SeriesPoint[];
        };
      };
    };
    function apply(json: MetricsJson) {
      if (!json.success || !json.data) return;
      setOverview((current) => ({ ...current, ...(json.data?.overview ?? {}) }));
      if (json.data.charts) {
        setGrowth(json.data.charts.growth ?? []);
        setRevenue(json.data.charts.revenue ?? []);
        setEnrollments(json.data.charts.enrollments ?? []);
        setAttendance(json.data.charts.attendance ?? []);
      }
      setActivity(json.data.activity ?? []);
      setCalendar(json.data.calendar ?? []);
    }
    async function load() {
      const counts = (await (
        await fetch("/api/dashboard/metrics?scope=super_admin&part=counts", {
          cache: "no-store",
        })
      ).json()) as MetricsJson;
      if (cancelled) return;
      apply(counts);
      setLoading(false);
      const full = (await (
        await fetch("/api/dashboard/metrics?scope=super_admin", { cache: "no-store" })
      ).json()) as MetricsJson;
      if (cancelled) return;
      apply(full);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description={
          loading
            ? "Loading live counts…"
            : "Students, instructors, courses, and revenue across Aviator Pass."
        }
        breadcrumbs={[{ label: "Super Admin" }, { label: "Dashboard" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={overview.totalStudents} icon={Users} />
        <StatCard label="Instructors" value={overview.totalInstructors} icon={GraduationCap} />
        <StatCard label="Courses" value={overview.totalCourses} icon={BookOpen} />
        <StatCard
          label="Active classes"
          value={overview.activeClasses}
          icon={Layers}
          hint="Live or scheduled this week"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly revenue"
          value={formatCurrency(overview.monthlyRevenue)}
          icon={DollarSign}
          hint={
            overview.platformGrowth
              ? `${overview.platformGrowth >= 0 ? "+" : ""}${overview.platformGrowth}% vs prior period`
              : undefined
          }
        />
        <StatCard
          label="Instructor wallets"
          value={formatCurrency(overview.instructorWalletBalance)}
          icon={Wallet}
        />
        <StatCard
          label="Pending payments"
          value={overview.pendingPayments}
          icon={CreditCard}
          hint="Awaiting settlement"
        />
        <StatCard label="Period growth" value={`${overview.platformGrowth}%`} icon={TrendingUp} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Student growth" description="Cumulative student registrations">
          <AreaTrendChart data={growth} gradientId="saGrowthFill" />
        </ChartCard>
        <ChartCard title="Revenue trend" description="Monthly platform revenue">
          <LineTrendChart data={revenue} />
        </ChartCard>
        <ChartCard title="Course enrollments" description="By program track">
          <BarsChart data={enrollments} />
        </ChartCard>
        <ChartCard title="Attendance" description="Live sessions this week">
          <BarsChart data={attendance} />
        </ChartCard>
      </div>

      <CalendarWidget events={calendar} title="Platform calendar" />

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickActions
          actions={[
            {
              label: "Create admin",
              href: "/super-admin/admins?create=1",
              icon: UserPlus,
              description: "Invite an administrator",
            },
            {
              label: "Add student",
              href: "/super-admin/students?create=1",
              icon: Users,
              description: "Create a learner account",
            },
            {
              label: "Add instructor",
              href: "/super-admin/instructors?create=1",
              icon: GraduationCap,
              description: "Onboard teaching staff",
            },
            {
              label: "Create course",
              href: "/super-admin/courses",
              icon: BookOpen,
              description: "Open the course catalog",
            },
            {
              label: "Reports",
              href: "/super-admin/reports",
              icon: FileBarChart,
              description: "Analytics and exports",
            },
            {
              label: "Platform settings",
              href: "/super-admin/settings",
              icon: Settings,
              description: "System configuration",
            },
          ]}
        />
        <RecentActivity items={activity} viewAllHref="/super-admin/activity-logs" />
      </div>
    </div>
  );
}

export { SuperAdminDashboardView };
