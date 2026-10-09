/**
 * Learning service — dashboard overview, enrolled courses, resources, resume.
 */

import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { getCourseById, getCourseDetail } from "@/services/courses/course-service";
import { ATPL_PACKAGE_LMS_COURSE_CODES } from "@/constants/atpl-complete-package";
import { officialCourseDisplayTitle } from "@/lib/courses/display-title";
import { stableCourseId } from "@/lib/courses/public-course-path";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb } from "@/services/courses/store";
import { computeRuntimeStatus, listLiveClasses } from "@/services/classes/class-service";
import { listParticipantsForUser, readClassesDb } from "@/services/classes/store";
import { ensureClassesSeeded } from "@/services/classes/seed";
import {
  getCourseLearningState,
  getOverallProgress,
  listProgressForStudent,
} from "@/services/learning/progress-service";
import { listHistory } from "@/services/learning/history-service";
import {
  listGoals,
  listStudySessions,
  syncGoalHoursFromProgress,
} from "@/services/learning/planner-service";
import { ensureLearningSeeded } from "@/services/learning/seed";
import { readLearningDb, writeLearningDb } from "@/services/learning/store";
import { newDashboardCorrelationId, safeDashboardQuery } from "@/lib/dashboard/safe-load";
import { generateId } from "@/lib/security/crypto";
import type {
  CourseLearningState,
  LearningCalendarItem,
  LearningDashboardOverview,
  OfflineCacheEntry,
  ResourceLibraryItem,
} from "@/types/learning";
import type { UserProfile } from "@/types";
import type { CourseListItem } from "@/types/courses";

export type { LearningCalendarItem };

function emptyCourseCounts(): CourseListItem["counts"] {
  return { modules: 0, lessons: 0, resources: 0, enrollments: 0, activeEnrollments: 0 };
}

function untouchedCourseLearning(
  studentId: string,
  courseId: string,
  enrollmentId: string,
): CourseLearningState {
  return {
    studentId,
    courseId,
    enrollmentId,
    lastLessonId: null,
    lastModuleId: null,
    progressPercent: 0,
    completedLessons: 0,
    totalLessons: 0,
    timeSpentSeconds: 0,
    bookmarked: false,
    favorited: false,
    startedAt: null,
    lastAccessedAt: null,
    completedAt: null,
  };
}

function asEnrolledListItem(course: {
  id: string;
  title: string;
  shortDescription?: string | null;
  fullDescription?: string | null;
  code: string;
  categoryId?: string | null;
  thumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  previewVideoUrl?: string | null;
  difficulty?: CourseListItem["difficulty"];
  language?: string;
  estimatedDurationMinutes?: number;
  enrollmentMode?: CourseListItem["enrollmentMode"];
  deliveryType?: CourseListItem["deliveryType"];
  enrollmentOpen?: boolean;
  hidden?: boolean;
  featured?: boolean;
  displayOrder?: number;
  status?: CourseListItem["status"];
  scheduledPublishAt?: string | null;
  primaryInstructorId?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  publishedAt?: string | null;
  archivedAt?: string | null;
}): CourseListItem {
  const stamp = course.createdAt ?? course.updatedAt ?? new Date().toISOString();
  return {
    id: course.id,
    title: officialCourseDisplayTitle(course),
    shortDescription: course.shortDescription ?? "",
    fullDescription: course.fullDescription ?? course.shortDescription ?? "",
    code: course.code,
    categoryId: course.categoryId ?? null,
    thumbnailUrl: course.thumbnailUrl ?? "/images/hero-aviation.svg",
    coverImageUrl: course.coverImageUrl ?? "/images/hero-aviation.svg",
    previewVideoUrl: course.previewVideoUrl ?? null,
    difficulty: course.difficulty ?? "advanced",
    language: course.language ?? "en",
    estimatedDurationMinutes: course.estimatedDurationMinutes ?? 0,
    enrollmentMode: course.enrollmentMode ?? "open",
    deliveryType: course.deliveryType ?? "recorded",
    enrollmentOpen: course.enrollmentOpen ?? true,
    hidden: course.hidden ?? false,
    featured: course.featured ?? false,
    displayOrder: course.displayOrder ?? 0,
    status: course.status ?? "published",
    scheduledPublishAt: course.scheduledPublishAt ?? null,
    primaryInstructorId: course.primaryInstructorId ?? null,
    priceAmount: course.priceAmount ?? null,
    currency: course.currency ?? null,
    tags: course.tags ?? ["atpl"],
    metadata: course.metadata ?? {},
    createdById: course.createdById ?? null,
    createdAt: stamp,
    updatedAt: course.updatedAt ?? stamp,
    deletedAt: course.deletedAt ?? null,
    publishedAt: course.publishedAt ?? stamp,
    archivedAt: course.archivedAt ?? null,
    categoryName: null,
    primaryInstructorName: null,
    counts: emptyCourseCounts(),
  };
}

function officialPackageCourseById(): Map<string, { id: string; code: string; title: string }> {
  const byId = new Map<string, { id: string; code: string; title: string }>();
  for (const code of ATPL_PACKAGE_LMS_COURSE_CODES) {
    const id = stableCourseId(code);
    if (!id) continue;
    byId.set(id, {
      id,
      code,
      title: officialCourseDisplayTitle({ code, title: code }),
    });
  }
  return byId;
}

export function listMyCourses(
  studentId: string,
  options?: {
    q?: string;
    sort?: "title" | "progress" | "recent";
    favoritedOnly?: boolean;
  },
): Array<CourseListItem & { learning: CourseLearningState | null }> {
  const officialById = officialPackageCourseById();
  const enrollments = listStudentEnrollments(studentId).filter((e) =>
    ["approved", "completed", "pending"].includes(e.status),
  );
  const startedCourseIds = new Set<string>();
  const needsCatalog = enrollments.some((row) => !officialById.has(row.courseId));
  const catalog = needsCatalog
    ? new Map((ensureCoursesSeeded(), readCoursesDb().courses.map((course) => [course.id, course])))
    : new Map<string, ReturnType<typeof readCoursesDb>["courses"][number]>();
  let rows: Array<CourseListItem & { learning: CourseLearningState | null }> = [];

  for (const e of enrollments) {
    const course =
      officialById.get(e.courseId) ?? catalog.get(e.courseId) ?? getCourseById(e.courseId, true);
    if (!course) continue;
    let learning: CourseLearningState | null = null;
    try {
      learning = startedCourseIds.has(e.courseId)
        ? getCourseLearningState(studentId, e.courseId)
        : untouchedCourseLearning(studentId, e.courseId, e.id);
    } catch {
      learning = null;
    }
    rows.push({ ...asEnrolledListItem(course), learning });
  }

  if (rows.length === 0) {
    const packageOwned = enrollments.some((row) => /ATPL|package/i.test(String(row.notes ?? "")));
    if (packageOwned) {
      const wanted = new Set<string>(ATPL_PACKAGE_LMS_COURSE_CODES);
      const packageCourses = readCoursesDb().courses.filter(
        (course) => !course.deletedAt && wanted.has(course.code),
      );
      for (const course of packageCourses) {
        const detail = getCourseById(course.id, true);
        if (!detail) continue;
        let learning: CourseLearningState | null = null;
        try {
          learning = startedCourseIds.has(course.id)
            ? getCourseLearningState(studentId, course.id)
            : untouchedCourseLearning(studentId, course.id, `package-${course.id}`);
        } catch {
          learning = null;
        }
        rows.push({ ...asEnrolledListItem(detail), learning });
      }
    }
  }

  if (options?.favoritedOnly) {
    const favIds = new Set(
      readLearningDb()
        .favorites.filter((f) => f.studentId === studentId && f.targetType === "course")
        .map((f) => f.targetId),
    );
    rows = rows.filter((r) => favIds.has(r.id));
  }
  if (options?.q) {
    const q = options.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.shortDescription.toLowerCase().includes(q),
    );
  }

  const sort = options?.sort ?? "recent";
  rows = [...rows].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "progress") {
      return (b.learning?.progressPercent ?? 0) - (a.learning?.progressPercent ?? 0);
    }
    return (b.learning?.lastAccessedAt ?? "").localeCompare(a.learning?.lastAccessedAt ?? "");
  });

  return rows;
}

export function getResumeTarget(studentId: string): LearningDashboardOverview["resume"] {
  const progress = listProgressForStudent(studentId)
    .filter((p) => !p.completed)
    .sort((a, b) => (b.lastAccessedAt ?? "").localeCompare(a.lastAccessedAt ?? ""));
  const row = progress[0];
  if (!row) {
    // Untouched enrollments must not load every course syllabus on the dashboard.
    return null;
  }
  const course = getCourseById(row.courseId);
  const detail = getCourseDetail(row.courseId);
  const lesson = detail?.modules.flatMap((m) => m.lessons).find((l) => l.id === row.lessonId);
  return {
    courseId: row.courseId,
    courseTitle: course?.title ?? "Course",
    lessonId: row.lessonId,
    lessonTitle: lesson?.title ?? "Lesson",
  };
}

export function emptyLearningDashboardOverview(): LearningDashboardOverview {
  return {
    activeCourses: 0,
    completedCourses: 0,
    upcomingLiveClass: null,
    upcomingLiveClassId: null,
    learningHours: 0,
    progressPercent: 0,
    assignments: 0,
    notifications: 0,
    resume: null,
    recentActivity: [],
    weeklyGoalPercent: 0,
  };
}

export function getLearningDashboard(user: UserProfile): LearningDashboardOverview {
  const enrollments = listStudentEnrollments(user.id).filter((e) =>
    ["approved", "completed", "pending"].includes(e.status),
  );
  const completedCourses = enrollments.filter((e) => e.status === "completed").length;
  return {
    activeCourses: Math.max(0, enrollments.length - completedCourses),
    completedCourses,
    upcomingLiveClass: null,
    upcomingLiveClassId: null,
    learningHours: 0,
    progressPercent: 0,
    assignments: 0,
    notifications: 0,
    resume: null,
    recentActivity: [],
    weeklyGoalPercent: 0,
  };
}

export function getLearningDashboardDetailed(user: UserProfile): LearningDashboardOverview {
  const correlationId = newDashboardCorrelationId();
  const path = "/student/dashboard";
  const base = {
    userId: user.id,
    role: user.role,
    correlationId,
    path,
  };

  safeDashboardQuery({
    ...base,
    label: "ensureClassesSeeded",
    fallback: undefined,
    run: () => {
      ensureClassesSeeded();
    },
  });
  safeDashboardQuery({
    ...base,
    label: "ensureLearningSeeded",
    fallback: undefined,
    run: () => {
      ensureLearningSeeded();
    },
  });
  safeDashboardQuery({
    ...base,
    label: "syncGoalHoursFromProgress",
    fallback: undefined,
    run: () => {
      syncGoalHoursFromProgress(user.id);
    },
  });

  const overall = safeDashboardQuery({
    ...base,
    label: "getOverallProgress",
    fallback: {
      activeCourses: 0,
      completedCourses: 0,
      learningHours: 0,
      progressPercent: 0,
      lessonsStarted: 0,
      lessonsCompleted: 0,
    },
    run: () => getOverallProgress(user.id),
  });

  const upcoming = safeDashboardQuery({
    ...base,
    label: "upcomingLiveClass",
    fallback: null as { id: string; title: string; startsAt: string } | null,
    run: () => {
      const db = readClassesDb();
      const allowed = new Set(listParticipantsForUser(user.id).map((p) => p.liveClassId));
      if (!allowed.size) return null;
      const now = Date.now();
      return (
        db.classes
          .filter((cls) => {
            if (!allowed.has(cls.id) || cls.deletedAt) return false;
            if (["cancelled", "draft", "completed"].includes(cls.status)) return false;
            const start = Date.parse(cls.startsAt);
            const end = Date.parse(cls.endsAt);
            if (!Number.isFinite(start)) return false;
            return start > now || (Number.isFinite(end) && end > now);
          })
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
      );
    },
  });

  const weeklyGoalPercent = safeDashboardQuery({
    ...base,
    label: "weeklyGoalPercent",
    fallback: 0,
    run: () => {
      const goals = listGoals(user.id).filter(
        (g) => g.status === "active" && g.period === "weekly",
      );
      const weeklyGoal = goals[0];
      return weeklyGoal
        ? Math.min(100, Math.round((weeklyGoal.completedHours / weeklyGoal.targetHours) * 100))
        : 0;
    },
  });

  const resume = safeDashboardQuery({
    ...base,
    label: "getResumeTarget",
    fallback: null,
    run: () => getResumeTarget(user.id),
  });

  const recentActivity = safeDashboardQuery({
    ...base,
    label: "listHistory",
    fallback: [],
    run: () => listHistory(user.id, { limit: 8 }),
  });

  return {
    activeCourses: overall.activeCourses,
    completedCourses: overall.completedCourses,
    upcomingLiveClass: upcoming
      ? `${upcoming.title} · ${new Date(upcoming.startsAt).toLocaleString()}`
      : null,
    upcomingLiveClassId: upcoming?.id ?? null,
    learningHours: overall.learningHours,
    progressPercent: overall.progressPercent,
    assignments: 0,
    notifications: 0,
    resume,
    recentActivity,
    weeklyGoalPercent,
  };
}

export function listResourceLibrary(
  studentId: string,
  options?: { q?: string; type?: string },
): ResourceLibraryItem[] {
  const courses = listMyCourses(studentId);
  const items: ResourceLibraryItem[] = [];
  for (const course of courses) {
    const detail = getCourseDetail(course.id);
    if (!detail) continue;
    for (const mod of detail.modules) {
      for (const lesson of mod.lessons) {
        for (const res of lesson.resources) {
          items.push({
            id: res.id,
            title: res.title,
            type: res.type,
            url: res.url,
            courseId: course.id,
            courseTitle: course.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            downloadable: res.downloadable,
            fileName: res.fileName,
          });
        }
      }
    }
  }
  let rows = items;
  if (options?.type && options.type !== "all") {
    rows = rows.filter((r) => r.type === options.type);
  }
  if (options?.q) {
    const q = options.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.courseTitle.toLowerCase().includes(q) ||
        r.lessonTitle.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function registerOfflineCache(input: {
  studentId: string;
  courseId: string;
  lessonId: string;
  contentVersion?: string;
  sizeBytes?: number | null;
}): OfflineCacheEntry {
  const now = new Date().toISOString();
  const entry: OfflineCacheEntry = {
    id: generateId(),
    studentId: input.studentId,
    courseId: input.courseId,
    lessonId: input.lessonId,
    cachedAt: now,
    contentVersion: input.contentVersion ?? now,
    sizeBytes: input.sizeBytes ?? null,
    syncedAt: null,
  };
  writeLearningDb((d) => {
    d.offlineCache = d.offlineCache.filter(
      (c) => !(c.studentId === input.studentId && c.lessonId === input.lessonId),
    );
    d.offlineCache.push(entry);
  });
  return entry;
}

export function listOfflineCache(studentId: string): OfflineCacheEntry[] {
  return readLearningDb().offlineCache.filter((c) => c.studentId === studentId);
}

export function getLearningCalendar(studentId: string): LearningCalendarItem[] {
  ensureClassesSeeded();
  ensureLearningSeeded();
  const now = Date.now();
  const items: LearningCalendarItem[] = [];

  const allowed = new Set(listParticipantsForUser(studentId).map((p) => p.liveClassId));
  for (const c of listLiveClasses({ pageSize: 100 }).data) {
    if (!allowed.has(c.id)) continue;
    const start = Date.parse(c.startsAt);
    const completed = c.status === "completed" || start < now - 60_000;
    items.push({
      id: `class-${c.id}`,
      title: c.title,
      type: "live_class",
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: completed ? "completed" : start > now ? "upcoming" : "past",
      href: `/student/schedule`,
      courseId: c.courseId,
    });
  }

  for (const s of listStudySessions(studentId)) {
    const start = Date.parse(s.scheduledStart);
    items.push({
      id: `session-${s.id}`,
      title: s.title,
      type: "study_session",
      startsAt: s.scheduledStart,
      endsAt: s.scheduledEnd,
      status: s.completed ? "completed" : start > now ? "upcoming" : "past",
      href: `/student/planner`,
      courseId: s.courseId,
    });
  }

  // Soft deadlines: resume incomplete lessons as study plan cues
  for (const course of listMyCourses(studentId).slice(0, 8)) {
    if (!course.learning?.lastLessonId) continue;
    const detail = getCourseDetail(course.id);
    const lesson = detail?.modules
      .flatMap((m) => m.lessons)
      .find((l) => l.id === course.learning?.lastLessonId);
    if (!lesson) continue;
    items.push({
      id: `lesson-${lesson.id}`,
      title: `Continue: ${lesson.title}`,
      type: "lesson",
      startsAt: course.learning.lastAccessedAt ?? new Date().toISOString(),
      endsAt: null,
      status: "upcoming",
      href: `/student/courses/${course.id}/lessons/${lesson.id}`,
      courseId: course.id,
    });
  }

  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function getLiveClassroomForStudentCourse(
  studentId: string,
  courseId: string,
): {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: "live" | "upcoming";
  href: string;
} | null {
  if (!studentId || !courseId) return null;
  ensureClassesSeeded();
  const allowed = new Set(listParticipantsForUser(studentId).map((p) => p.liveClassId));
  const now = Date.now();
  const rows = listLiveClasses({ courseId, pageSize: 80 }).data.filter((cls) => {
    if (!allowed.has(cls.id)) return false;
    if (["cancelled", "draft", "completed"].includes(cls.status)) return false;
    return Number.isFinite(Date.parse(cls.startsAt));
  });
  const live = rows.find((cls) => computeRuntimeStatus(cls) === "live_now");
  const upcoming = rows
    .filter((cls) => Date.parse(cls.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const match = live ?? upcoming ?? null;
  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    startsAt: match.startsAt,
    endsAt: match.endsAt,
    status: live ? "live" : "upcoming",
    href: `/join/${match.id}`,
  };
}

export function searchLearning(
  studentId: string,
  q: string,
): {
  courses: CourseListItem[];
  lessons: Array<{ id: string; title: string; courseId: string; courseTitle: string }>;
  resources: ResourceLibraryItem[];
} {
  const query = q.trim().toLowerCase();
  if (!query) return { courses: [], lessons: [], resources: [] };
  const courses = listMyCourses(studentId, { q: query });
  const lessons: Array<{ id: string; title: string; courseId: string; courseTitle: string }> = [];
  for (const c of listMyCourses(studentId)) {
    const detail = getCourseDetail(c.id);
    if (!detail) continue;
    for (const m of detail.modules) {
      for (const l of m.lessons) {
        if (l.title.toLowerCase().includes(query) || l.description.toLowerCase().includes(query)) {
          lessons.push({
            id: l.id,
            title: l.title,
            courseId: c.id,
            courseTitle: c.title,
          });
        }
      }
    }
  }
  return {
    courses: courses.map(({ learning, ...c }) => {
      void learning;
      return c;
    }),
    lessons,
    resources: listResourceLibrary(studentId, { q: query }),
  };
}
