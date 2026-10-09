/**
 * Dashboard metrics — live counts from auth, courses, classes, finance, and communication stores.
 */

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { listAllSessions, listAllUsers } from "@/lib/data/auth-identity-store";
import { listActivityForActor, listRecentActivityLogs } from "@/lib/data/auth-activity-store";
import { findUserById, toUserProfile, type StoredUser } from "@/services/auth/store";
import { ROLES, type Role } from "@/constants/roles";
import { ACCOUNT_STATUS } from "@/constants/account-status";
import { getCourseStats } from "@/services/courses/course-service";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import {
  countEnrollmentsByCourse,
  listEnrollmentsForStudent,
  readCoursesDb,
} from "@/services/courses/store";
import { getClassStats } from "@/services/classes/class-service";
import { ensureClassesSeeded } from "@/services/classes/seed";
import { readClassesDb } from "@/services/classes/store";
import { ensureCommunicationSeeded } from "@/services/communication/seed";
import { readCommunicationDb } from "@/services/communication/store";
import type { SeriesPoint } from "@/components/dashboard/chart-types";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { ActivityItem } from "@/components/dashboard/recent-activity";
import { listWallets } from "@/services/payments/wallet-service";
import { listWrittenAttempts } from "@/services/mock-exams/written-exam-service";
import { getCalendarEventsForUser } from "@/services/classes/calendar-service";
import { ensureLearningSeeded } from "@/services/learning/seed";
import { getLearningDashboard } from "@/services/learning/learning-service";
import { ensureCertificatesSeeded } from "@/services/certificates/seed";
import { listCertificates } from "@/services/certificates/certificate-service";
import { getFinanceDashboard } from "@/services/payments/report-service";
import { listInstructorStudents } from "@/services/courses/instructor-students";
import type { UserProfile } from "@/types";

export { ensureDemoUsersSeeded };

function countByRole(users: StoredUser[], role: Role): number {
  return users.filter((u) => u.role === role).length;
}

function communicationOpsCounts() {
  ensureCommunicationSeeded();
  const comm = readCommunicationDb();
  const monthPrefix = new Date().toISOString().slice(0, 7);
  return {
    communityReports: comm.moderationLogs.filter((l) => l.action === "flag" || l.action === "block")
      .length,
    blogActivity: comm.blogPosts.filter(
      (p) =>
        p.status === "published" &&
        (p.publishedAt?.startsWith(monthPrefix) || p.updatedAt.startsWith(monthPrefix)),
    ).length,
  };
}

export function getPlatformOverview() {
  const users = listAllUsers();
  const students = countByRole(users, ROLES.STUDENT);
  const instructors = countByRole(users, ROLES.INSTRUCTOR);
  const admins = countByRole(users, ROLES.ADMIN) + countByRole(users, ROLES.SUPER_ADMIN);
  const courseStats = getCourseStats();
  const now = Date.now();
  const classes = readClassesDb().classes;
  let liveNow = 0;
  let upcoming = 0;
  let cancelled = 0;
  let today = 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const dayEnd = dayStart + 86_400_000;
  for (const cls of classes) {
    if (cls.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (["draft", "completed"].includes(cls.status)) continue;
    const start = Date.parse(cls.startsAt);
    const end = Date.parse(cls.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (now >= start && now <= end) liveNow += 1;
    else if (start > now) upcoming += 1;
    if (start >= dayStart && start < dayEnd) today += 1;
  }
  const finance = getFinanceDashboard();
  const wallets = listWallets();
  const growth =
    finance.monthlyGrowth.length > 1
      ? Math.round(
          ((finance.monthlyGrowth.at(-1)!.value - finance.monthlyGrowth.at(-2)!.value) /
            Math.max(1, finance.monthlyGrowth.at(-2)!.value)) *
            1000,
        ) / 10
      : 0;

  return {
    totalStudents: students,
    totalInstructors: instructors,
    totalAdmins: admins,
    totalUsers: users.length,
    totalCourses: courseStats.totalCourses,
    publishedCourses: courseStats.publishedCourses,
    draftCourses: courseStats.draftCourses,
    activeCourseStudents: courseStats.activeStudents,
    activeClasses: liveNow + today,
    upcomingClasses: upcoming,
    cancelledClasses: cancelled,
    attendanceRate: 0,
    monthlyRevenue: finance.monthlyRevenue,
    instructorWalletBalance: wallets.reduce((s, w) => s + w.availableBalance, 0),
    pendingPayments: finance.pendingPayments,
    platformGrowth: growth,
    pendingApprovals: users.filter((u) => u.status === ACCOUNT_STATUS.PENDING).length,
    ...communicationOpsCounts(),
    liveClasses: liveNow,
    activeSessions: listAllSessions().filter((s) => !s.revokedAt).length,
  };
}

export function getGrowthSeries(): SeriesPoint[] {
  ensureDemoUsersSeeded();
  const students = listAllUsers().filter((u) => u.role === ROLES.STUDENT);
  const map = new Map<string, number>();
  for (const u of students) {
    const key = u.createdAt.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  let running = 0;
  const series = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => {
      running += count;
      return { name, value: running };
    });
  return series.length ? series : [{ name: "Now", value: students.length }];
}

export function getRevenueSeries(): SeriesPoint[] {
  const finance = getFinanceDashboard();
  return finance.monthlyGrowth.length
    ? finance.monthlyGrowth
    : [{ name: "Now", value: finance.monthlyRevenue }];
}

/**
 * Lightweight enrollment chart for role dashboards.
 * Avoids buildExecutiveAnalytics() — that path seeds every module and can take minutes.
 */
export function getEnrollmentSeries(): SeriesPoint[] {
  ensureCoursesSeeded();
  const db = readCoursesDb();
  const byId = new Map(db.courses.map((c) => [c.id, c]));
  const counts = countEnrollmentsByCourse();
  const top = counts
    .map((row) => ({
      name: byId.get(row.courseId)?.code ?? row.courseId.slice(0, 6),
      value: row.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  if (top.length) return top;

  const buckets = { PPL: 0, CPL: 0, ATPL: 0 };
  for (const row of counts) {
    const code = byId.get(row.courseId)?.code ?? "";
    if (code.startsWith("ATPL")) buckets.ATPL += row.count;
    else if (code.startsWith("CPL")) buckets.CPL += row.count;
    else if (code.startsWith("PPL")) buckets.PPL += row.count;
  }
  return [
    { name: "PPL", value: buckets.PPL },
    { name: "CPL", value: buckets.CPL },
    { name: "ATPL", value: buckets.ATPL },
  ];
}

export function getAttendanceSeries(instructorId?: string, studentId?: string): SeriesPoint[] {
  ensureClassesSeeded();
  const db = readClassesDb();
  const now = Date.now();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Map<string, { present: number; total: number }>();
  for (const cls of db.classes) {
    const start = Date.parse(cls.startsAt);
    if (!Number.isFinite(start) || start > now) continue;
    if (instructorId && cls.instructorId !== instructorId) continue;
    const day = days[new Date(start).getDay()] ?? "Mon";
    const bucket = counts.get(day) ?? { present: 0, total: 0 };
    const records = db.attendance?.filter((a) => a.liveClassId === cls.id) ?? [];
    const scoped = studentId ? records.filter((a) => a.studentId === studentId) : records;
    bucket.total += scoped.length || (studentId ? 0 : 1);
    bucket.present += scoped.filter((a) => a.status === "present" || a.status === "late").length;
    counts.set(day, bucket);
  }
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => {
    const bucket = counts.get(name);
    return {
      name,
      value: bucket && bucket.total ? Math.round((bucket.present / bucket.total) * 100) : 0,
    };
  });
}

export function getEarningsSeries(): SeriesPoint[] {
  const finance = getFinanceDashboard();
  return finance.monthlyGrowth.map((p) => ({
    name: p.name,
    value: Math.round(p.value * 0.35),
  }));
}

export function getProgressBreakdown(studentUserId?: string | null): {
  name: string;
  value: number;
}[] {
  if (studentUserId) {
    ensureLearningSeeded();
    const student = findUserById(studentUserId);
    if (student) {
      const learning = getLearningDashboard(toUserProfile(student));
      const completed = Math.max(0, Math.min(100, Math.round(learning.progressPercent)));
      const inProgress = Math.max(0, Math.min(100 - completed, 100 - completed));
      const notStarted = Math.max(0, 100 - completed - Math.round(inProgress * 0.5));
      const mid = Math.max(0, 100 - completed - notStarted);
      return [
        { name: "Completed", value: completed },
        { name: "In progress", value: mid },
        { name: "Not started", value: notStarted },
      ];
    }
  }
  return [
    { name: "Completed", value: 0 },
    { name: "In progress", value: 0 },
    { name: "Not started", value: 0 },
  ];
}

export function getDashboardCalendarEvents(user?: UserProfile | null): CalendarEvent[] {
  ensureClassesSeeded();
  if (user) {
    return getCalendarEventsForUser(user).map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      type: e.type,
    }));
  }
  return [];
}

export function getRecentActivityFeed(actorUserId?: string | null): ActivityItem[] {
  ensureDemoUsersSeeded();
  const logs = actorUserId ? listActivityForActor(actorUserId) : listRecentActivityLogs(8);
  return logs.slice(0, 8).map((log) => ({
    id: log.id,
    title: log.action,
    description: [log.entityType, log.entityId?.slice(0, 8)].filter(Boolean).join(" · "),
    timestamp: log.createdAt,
    badge: log.action.split(".")[0],
  }));
}

export function listUsersByRole(
  role?: Role,
  options?: { page?: number; pageSize?: number; columns?: "profile" | "full" },
) {
  ensureDemoUsersSeeded();
  const users = role ? listAllUsers().filter((u) => u.role === role) : listAllUsers();
  const pageSize = Math.min(200, Math.max(1, options?.pageSize ?? users.length));
  const page = Math.max(1, options?.page ?? 1);
  const start = (page - 1) * pageSize;
  return users.slice(start, start + pageSize).map(toUserProfile);
}

export function getInstructorOverview(instructorUserId?: string | null) {
  ensureCoursesSeeded();
  ensureClassesSeeded();
  const instructor = instructorUserId ? findUserById(instructorUserId) : null;
  if (
    !instructor ||
    (instructor.role !== ROLES.INSTRUCTOR && instructor.role !== ROLES.CHIEF_GROUND_INSTRUCTOR)
  ) {
    return {
      myCourses: 0,
      todaysClasses: 0,
      upcomingClasses: 0,
      students: 0,
      assignments: 0,
      quizzes: 0,
      earnings: 0,
      walletBalance: 0,
    };
  }
  const mine = listCoursesForMetrics({
    role: "instructor",
    instructorId: instructor.id,
  });
  const classStats = getClassStats(instructor.id);
  const students = listInstructorStudents(instructor.id).reduce((set, row) => {
    set.add(row.studentId);
    return set;
  }, new Set<string>()).size;
  return {
    myCourses: mine,
    todaysClasses: classStats.today,
    upcomingClasses: classStats.upcoming,
    students,
    assignments: 0,
    quizzes: 0,
    earnings: listWallets().find((w) => w.instructorId === instructor.id)?.lifetimeEarned ?? 0,
    walletBalance:
      listWallets().find((w) => w.instructorId === instructor.id)?.availableBalance ?? 0,
  };
}

export function getStudentOverview(studentUserId?: string | null) {
  ensureCoursesSeeded();
  ensureLearningSeeded();
  const student = studentUserId ? findUserById(studentUserId) : null;
  if (student && student.role !== ROLES.STUDENT) {
    return {
      currentCourses: 0,
      nextLiveClass: "None scheduled",
      progress: 0,
      certificates: 0,
      notifications: 0,
      assignments: 0,
      quizzes: 0,
      weeklyProgress: 0,
      attendance: 0,
      learningHours: 0,
    };
  }
  if (student) {
    const learning = getLearningDashboard(toUserProfile(student));
    ensureCertificatesSeeded();
    const certificates = listCertificates({ studentId: student.id, status: "issued" }).length;
    return {
      currentCourses: learning.activeCourses,
      nextLiveClass: learning.upcomingLiveClass ?? "None scheduled",
      progress: Math.round(learning.progressPercent),
      certificates,
      notifications: learning.notifications,
      assignments: learning.assignments,
      quizzes: listWrittenAttempts(student.id).filter((a) => a.status !== "in_progress").length,
      weeklyProgress: learning.weeklyGoalPercent,
      attendance: getClassStats({ studentId: student.id }).attendanceRate,
      learningHours: learning.learningHours,
    };
  }
  // Never fall back to another student's demo profile — empty for this account only.
  return {
    currentCourses: 0,
    nextLiveClass: "None scheduled",
    progress: 0,
    certificates: 0,
    notifications: 0,
    assignments: 0,
    quizzes: 0,
    weeklyProgress: 0,
    attendance: 0,
    learningHours: 0,
  };
}

function listCoursesForMetrics(opts: {
  role: "instructor" | "student";
  instructorId?: string | null;
}): number {
  const db = readCoursesDb();
  const users = listAllUsers();
  if (opts.role === "instructor") {
    const instructor =
      (opts.instructorId ? findUserById(opts.instructorId) : null) ??
      users.find((u) => u.role === ROLES.INSTRUCTOR);
    if (!instructor) return 0;
    const ids = new Set(
      db.instructors.filter((i) => i.userId === instructor.id).map((i) => i.courseId),
    );
    for (const course of db.courses) {
      if (!course.deletedAt && course.primaryInstructorId === instructor.id) {
        ids.add(course.id);
      }
    }
    return db.courses.filter((c) => !c.deletedAt && ids.has(c.id)).length;
  }
  const student = users.find((u) => u.role === ROLES.STUDENT && u.status === ACCOUNT_STATUS.ACTIVE);
  if (!student) return 0;
  return listEnrollmentsForStudent(student.id).filter((e) =>
    ["approved", "completed", "pending"].includes(e.status),
  ).length;
}

export function getAdminDashboardPayload(user?: UserProfile | null) {
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensureClassesSeeded();
  return {
    overview: getAdminOverview(),
    growth: getGrowthSeries(),
    enrollments: getEnrollmentSeries(),
    activity: getRecentActivityFeed(),
    calendar: getDashboardCalendarEvents(user),
  };
}

export function getAdminOverview() {
  // Keep this path cheap — admin dashboard SSR must not call getClassStats /
  // buildExecutiveAnalytics (multi-second / multi-minute on seeded data).
  ensureDemoUsersSeeded();
  ensureCoursesSeeded();
  ensureClassesSeeded();
  const users = listAllUsers();
  const courseStats = getCourseStats();
  const now = Date.now();
  const liveClasses = readClassesDb().classes.filter((cls) => {
    if (["cancelled", "draft", "completed"].includes(cls.status)) return false;
    const start = Date.parse(cls.startsAt);
    const end = Date.parse(cls.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  }).length;

  return {
    students: countByRole(users, ROLES.STUDENT),
    instructors: countByRole(users, ROLES.INSTRUCTOR),
    courses: courseStats.totalCourses,
    liveClasses,
    pendingApprovals: users.filter((u) => u.status === ACCOUNT_STATUS.PENDING).length,
    ...communicationOpsCounts(),
  };
}
