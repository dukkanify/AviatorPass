"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { PlayCircle, Search } from "lucide-react";

import { ACTION_LABELS } from "@/constants/programme-terms";
import {
  ATPL_COMPLETE_PACKAGE_NAME,
  ATPL_PENDING_INSTRUCTOR_ASSIGNMENT,
  easaCodeFromAtplCourseCode,
  type AtplPackageScheduleSnapshot,
  type AtplPackageSubjectProgress,
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
import { learningFetch } from "@/features/learning/lib/api";
import { safePath } from "@/lib/links/safe-href";
import type { CourseLearningState } from "@/types/learning";
import type { CourseListItem } from "@/types/courses";

type CourseRow = CourseListItem & { learning: CourseLearningState | null };
type SubjectState = "done" | "current" | "next" | "later";

function cleanLabel(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || /undefined|null/i.test(text)) return null;
  return text;
}

function subjectState(
  subject: AtplPackageSubjectProgress,
  subjects: AtplPackageSubjectProgress[],
): SubjectState {
  if (subject.status === "completed") return "done";
  const current = subjects.find(
    (row) => row.status === "available" || row.status === "in_progress",
  );
  if (current?.code === subject.code) return "current";
  const next = subjects.find((row) => row.status === "locked");
  if (next?.code === subject.code) return "next";
  if (subject.status === "locked") return "later";
  return "current";
}

function lectureLabel(
  subject: AtplPackageSubjectProgress,
  state: SubjectState,
  schedule: AtplPackageScheduleSnapshot,
): string | null {
  if (state === "done") return "Completed";
  if (state === "later") return null;
  if (
    state === "current" &&
    (subject.opening || subject.code === schedule.firstLectureSubjectCode)
  ) {
    if (schedule.scheduleProvisional) {
      const requested = cleanLabel(schedule.requestedFirstLectureLabel);
      return requested ? `Requested ${requested}` : "First lecture time is still being confirmed";
    }
    return cleanLabel(schedule.confirmedFirstLectureLabel) ?? "First lecture confirmed";
  }
  const booked = cleanLabel(schedule.nextLectureLabel);
  if (subject.code === schedule.nextSubjectCode && booked) return booked;
  if (state === "next") {
    return "Next session. Your instructor sets the date after the current lecture.";
  }
  return null;
}

function classroomHref(
  subject: AtplPackageSubjectProgress,
  schedule: AtplPackageScheduleSnapshot,
): string | null {
  if (
    (subject.opening || subject.code === schedule.firstLectureSubjectCode) &&
    schedule.firstLectureLiveClassId
  ) {
    return `/join/${schedule.firstLectureLiveClassId}`;
  }
  if (subject.code === schedule.nextSubjectCode && schedule.nextLectureLiveClassId) {
    return `/join/${schedule.nextLectureLiveClassId}`;
  }
  return null;
}

function PaidPackageSteps({ schedule }: { schedule: AtplPackageScheduleSnapshot }) {
  const assignmentPending = schedule.instructorAssignmentStatus === "pending";
  const instructor = assignmentPending
    ? ATPL_PENDING_INSTRUCTOR_ASSIGNMENT
    : cleanLabel(schedule.assignedTkLabel) ||
      cleanLabel(schedule.assignedInstructorName) ||
      cleanLabel(schedule.instructorAssignmentLabel) ||
      "Instructor assigned";
  const lecture =
    cleanLabel(
      schedule.scheduleProvisional
        ? schedule.requestedFirstLectureLabel
        : schedule.confirmedFirstLectureLabel,
    ) ||
    schedule.firstLectureSubjectTitle ||
    "Instrumentation";

  return (
    <section className="sl-package" aria-labelledby="atpl-next-steps-title">
      <div>
        <p className="sl-package-kicker">{ATPL_COMPLETE_PACKAGE_NAME}</p>
        <h2 id="atpl-next-steps-title" className="sl-section-title" style={{ marginTop: 6 }}>
          Your package path
        </h2>
      </div>
      <div className="sl-package-status">
        <article>
          <p className="sl-package-kicker">Payment</p>
          <strong>Package confirmed.</strong>
          <Badge className="w-fit" variant="secondary">
            {ACTION_LABELS.stepComplete}
          </Badge>
        </article>
        <article>
          <p className="sl-package-kicker">{ACTION_LABELS.instructorAssignmentStep}</p>
          <strong>{instructor}</strong>
          <Badge className="w-fit" variant={assignmentPending ? "destructive" : "secondary"}>
            {assignmentPending ? ACTION_LABELS.stepIncomplete : ACTION_LABELS.stepComplete}
          </Badge>
        </article>
        <article>
          <p className="sl-package-kicker">Current lecture</p>
          <strong>{lecture}</strong>
          {schedule.firstLectureLiveClassId ? (
            <Link className="sl-btn-gold" href={`/join/${schedule.firstLectureLiveClassId}`}>
              Join Zoom
            </Link>
          ) : (
            <p className="sl-muted">
              {schedule.scheduleProvisional
                ? "Waiting for TKI 1 to confirm the time."
                : "On your timetable."}
            </p>
          )}
        </article>
      </div>
      <div>
        <p className="sl-package-kicker">Subject schedule</p>
        <p className="sl-muted" style={{ marginTop: 6 }}>
          All 13 subjects stay in this order. After each lecture the instructor sets homework, files
          the performance report, then books the next session.
        </p>
      </div>
      <ol className="sl-package-list">
        {schedule.subjects.map((subject, index) => {
          const state = subjectState(subject, schedule.subjects);
          const previous = index > 0 ? schedule.subjects[index - 1] : null;
          const detail =
            lectureLabel(subject, state, schedule) ??
            (state === "later" && previous ? `Follows ${previous.title}` : null);
          const href =
            state === "current" || state === "next" ? classroomHref(subject, schedule) : null;
          return (
            <li
              key={subject.code}
              className="sl-package-row"
              data-state={state}
              data-status={subject.status}
            >
              <span className="sl-package-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>
                  {subject.code} {subject.title}
                </strong>
                {detail ? <p className="sl-muted">{detail}</p> : null}
              </div>
              {href ? (
                <Link className="sl-btn-gold" href={href}>
                  Join Zoom
                </Link>
              ) : (
                <span className="sl-muted">
                  {state === "done"
                    ? ACTION_LABELS.stepComplete
                    : state === "current"
                      ? "Now"
                      : state === "next"
                        ? "Next"
                        : "Queued"}
                </span>
              )}
            </li>
          );
        })}
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

  const packageCodes = new Set((schedule?.subjects ?? []).map((subject) => subject.code));
  const otherCourses = courses.filter((course) => {
    const code = easaCodeFromAtplCourseCode(course.code);
    return !(schedule?.packageOwned && code && packageCodes.has(code));
  });
  const showPackage = Boolean(schedule?.packageOwned && schedule.subjects.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My courses"
        description={
          showPackage
            ? "Your ATPL subjects, in order. A date appears only when a lecture is booked."
            : "Search, filter, and continue enrolled programs."
        }
        breadcrumbs={[{ label: "Student" }, { label: "My Courses" }]}
      />

      {!showPackage && (loading || error || courses.length > 0) ? (
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

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          {showPackage && schedule ? <PaidPackageSteps schedule={schedule} /> : null}
          {otherCourses.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {otherCourses.map((course) => {
                const pct = Math.round(course.learning?.progressPercent ?? 0);
                const resumeId = course.learning?.lastLessonId;
                const started = Boolean(resumeId) || pct > 0;
                const href = resumeId
                  ? safePath(
                      ["student", "courses", course.id, "lessons", resumeId],
                      "/student/courses",
                    )
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
                      <Button asChild size="sm">
                        <Link href={href}>
                          <PlayCircle className="size-4" />
                          {started ? ACTION_LABELS.continueLesson : ACTION_LABELS.startLesson}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}
          {!showPackage && otherCourses.length === 0 ? <MyCoursesEmptyState /> : null}
        </>
      )}
    </div>
  );
}

export { MyCoursesView };
