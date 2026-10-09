"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { Bookmark, PlayCircle, Search, Star } from "lucide-react";

import { ACTION_LABELS } from "@/constants/programme-terms";
import {
  ATPL_COMPLETE_PACKAGE_NAME,
  ATPL_INSTRUCTOR_CONFIRM_NOTICE,
  ATPL_PACKAGE_TKI_NOTICE,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
  type AtplPackageScheduleSnapshot,
} from "@/constants/atpl-complete-package";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { MyCoursesEmptyState } from "@/features/learning/components/my-courses-empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DIFFICULTY_LABELS } from "@/constants/courses";
import { learningFetch, learningJson } from "@/features/learning/lib/api";
import { safePath } from "@/lib/links/safe-href";
import type { CourseLearningState } from "@/types/learning";
import type { CourseListItem } from "@/types/courses";

type CourseRow = CourseListItem & { learning: CourseLearningState | null };

function PaidPackageSteps({ schedule }: { schedule: AtplPackageScheduleSnapshot }) {
  const assignmentPending = schedule.instructorAssignmentStatus === "pending";
  return (
    <section
      className="rounded-2xl border border-accent/40 bg-card p-5 shadow-soft sm:p-6"
      aria-labelledby="atpl-next-steps-title"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
        {ATPL_COMPLETE_PACKAGE_NAME}
      </p>
      <h2 id="atpl-next-steps-title" className="mt-1 font-display text-xl tracking-tight">
        Your next steps
      </h2>
      <ol className="mt-4 space-y-3">
        <li className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Payment</p>
            <p className="text-xs text-muted-foreground">Package confirmed.</p>
          </div>
          <Badge variant="secondary">{ACTION_LABELS.stepComplete}</Badge>
        </li>
        <li className="flex items-start justify-between gap-3 rounded-xl border border-accent/50 bg-accent/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{ACTION_LABELS.instructorAssignmentStep}</p>
            <p className="text-xs text-muted-foreground">
              {assignmentPending
                ? `${ATPL_PENDING_INSTRUCTOR_ASSIGNMENT}. ${ATPL_INSTRUCTOR_CONFIRM_NOTICE}`
                : schedule.instructorAssignmentLabel}
            </p>
          </div>
          <Badge variant={assignmentPending ? "destructive" : "secondary"}>
            {assignmentPending ? ACTION_LABELS.stepIncomplete : ACTION_LABELS.stepComplete}
          </Badge>
        </li>
        <li className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium">First lecture</p>
            <p className="text-xs text-muted-foreground">
              {schedule.scheduleProvisional
                ? schedule.requestedFirstLectureLabel
                  ? `Requested ${schedule.requestedFirstLectureLabel}. ${ATPL_PACKAGE_TKI_NOTICE}`
                  : ATPL_PACKAGE_TKI_NOTICE
                : schedule.confirmedFirstLectureLabel
                  ? `Confirmed ${schedule.confirmedFirstLectureLabel}`
                  : ATPL_PACKAGE_TKI_NOTICE}
            </p>
          </div>
          <Badge variant={schedule.scheduleProvisional ? "outline" : "secondary"}>
            {schedule.scheduleProvisional
              ? ACTION_LABELS.stepIncomplete
              : ACTION_LABELS.stepComplete}
          </Badge>
        </li>
      </ol>
    </section>
  );
}

function MyCoursesView() {
  const [courses, setCourses] = React.useState<CourseRow[]>([]);
  const [schedule, setSchedule] = React.useState<AtplPackageScheduleSnapshot | null>(null);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "title" | "progress">("recent");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, q });
    const [result, scheduleResult] = await Promise.all([
      learningFetch<CourseRow[]>(`/api/learning/courses?${params}`),
      learningFetch<AtplPackageScheduleSnapshot>("/api/learning/atpl-schedule"),
    ]);
    setSchedule(scheduleResult.data ?? null);
    if (!result.success) {
      setError(result.error ?? "Unable to load courses");
      setCourses([]);
    } else {
      setCourses(result.data ?? []);
      setError(null);
    }
    setLoading(false);
  }, [q, sort]);

  React.useEffect(() => {
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [load]);

  async function toggleFavorite(course: CourseRow) {
    const existing = course.learning?.favorited;
    if (existing) {
      const favs =
        await learningFetch<Array<{ id: string; targetId: string }>>("/api/learning/favorites");
      const row = favs.data?.find((f) => f.targetId === course.id);
      if (row) await learningJson(`/api/learning/favorites/${row.id}`, "DELETE");
    } else {
      await learningJson("/api/learning/favorites", "POST", {
        targetType: "course",
        targetId: course.id,
        label: course.title,
      });
    }
    void load();
  }

  async function bookmarkCourse(course: CourseRow) {
    await learningJson("/api/learning/bookmarks", "POST", {
      targetType: "section",
      targetId: course.id,
      courseId: course.id,
      label: course.title,
    });
    void load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My courses"
        description="Search, filter, and continue enrolled programs."
        breadcrumbs={[{ label: "Student" }, { label: "My Courses" }]}
      />

      {loading || error || courses.length > 0 || schedule?.packageOwned ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search courses…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort courses"
          >
            <option value="recent">Recently accessed</option>
            <option value="title">Title</option>
            <option value="progress">Progress</option>
          </select>
        </div>
      ) : null}

      {!loading && schedule?.packageOwned ? <PaidPackageSteps schedule={schedule} /> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : courses.length === 0 && schedule?.packageOwned ? (
        <ol className="grid gap-4 md:grid-cols-2">
          {(schedule.subjects.length ? schedule.subjects : []).map((subject) => (
            <li key={subject.code}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="font-display text-xl leading-tight">
                    {subject.title}
                  </CardTitle>
                  <CardDescription>{subject.shortDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={subject.opening ? "secondary" : "outline"}>
                    {subject.opening
                      ? ATPL_PENDING_INSTRUCTOR_ASSIGNMENT
                      : subject.status === "locked"
                        ? ACTION_LABELS.stepIncomplete
                        : subject.status}
                  </Badge>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      ) : courses.length === 0 ? (
        <MyCoursesEmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const pct = Math.round(course.learning?.progressPercent ?? 0);
            const resumeId = course.learning?.lastLessonId;
            const started = Boolean(resumeId) || pct > 0;
            const href = resumeId
              ? safePath(["student", "courses", course.id, "lessons", resumeId], "/student/courses")
              : safePath(["student", "courses", course.id], "/student/courses");
            return (
              <Card key={course.id} className="flex flex-col overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="font-display text-xl leading-tight">
                        {course.title}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {course.shortDescription}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      {DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>
                        {course.learning?.completedLessons ?? 0}/
                        {course.learning?.totalLessons ?? 0} lessons
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={href}>
                        <PlayCircle className="size-4" />
                        {started ? ACTION_LABELS.continueLesson : ACTION_LABELS.startLesson}
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggleFavorite(course)}>
                      <Star
                        className={`size-4 ${course.learning?.favorited ? "fill-current" : ""}`}
                      />
                      Favorite
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void bookmarkCourse(course)}>
                      <Bookmark className="size-4" />
                      Bookmark
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { MyCoursesView };
