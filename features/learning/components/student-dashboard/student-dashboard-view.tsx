"use client";

import * as React from "react";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  GraduationCap,
  Headset,
  MessageSquare,
  PlayCircle,
  Sparkles,
} from "lucide-react";

import Link from "@/components/ui/app-link";
import { learningFetch } from "@/features/learning/lib/api";
import { safePath } from "@/lib/links/safe-href";
import { useAuth } from "@/providers/auth-provider";
import type { Certificate } from "@/types/certificates";
import type { CourseListItem } from "@/types/courses";
import type {
  CourseLearningState,
  LearningCalendarItem,
  LearningDashboardOverview,
  LearningHistoryEvent,
  StudyGoal,
  StudySession,
} from "@/types/learning";
import {
  activityKindLabel,
  calendarKindLabel,
  clampPercent,
  countdownLabel,
  courseThumb,
  estimatedCompletion,
  firstNameOf,
  formatHours,
  formatRemainingLessons,
  goalHours,
  greetingForHour,
  initialsOf,
  ringOffset,
  sameDay,
  weekDays,
} from "./student-dashboard-utils";

type CourseRow = CourseListItem & { learning: CourseLearningState | null };
type CourseFilter = "all" | "progress" | "new" | "done";

function ProgressRing({ value, label }: { value: number; label: string }) {
  const percent = clampPercent(value);
  const offset = ringOffset(percent);
  return (
    <svg className="sl-ring" viewBox="0 0 132 132" role="img" aria-label={label}>
      <circle cx="66" cy="66" r="54" fill="none" stroke="#eeeae2" strokeWidth="10" />
      <circle
        cx="66"
        cy="66"
        r="54"
        fill="none"
        stroke="#cca04c"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * 54}`}
        strokeDashoffset={offset}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="62" textAnchor="middle" fontSize="22" fontWeight="700" fill="#143048">
        {percent}%
      </text>
      <text x="66" y="82" textAnchor="middle" fontSize="10" fill="#7c7b80">
        Complete
      </text>
    </svg>
  );
}

function LearningDashboardView() {
  const { user } = useAuth();
  const [overview, setOverview] = React.useState<LearningDashboardOverview | null>(null);
  const [courses, setCourses] = React.useState<CourseRow[]>([]);
  const [calendar, setCalendar] = React.useState<LearningCalendarItem[]>([]);
  const [sessions, setSessions] = React.useState<StudySession[]>([]);
  const [goals, setGoals] = React.useState<StudyGoal[]>([]);
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<CourseFilter>("all");
  const [selectedDay, setSelectedDay] = React.useState(() => new Date().toISOString());
  const [now, setNow] = React.useState(() => Date.now());
  const [joining, setJoining] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [dash, courseRes, calRes, sessionRes, goalRes, certRes] = await Promise.all([
        learningFetch<LearningDashboardOverview>("/api/learning/dashboard"),
        learningFetch<CourseRow[]>("/api/learning/courses?sort=recent"),
        learningFetch<LearningCalendarItem[]>("/api/learning/calendar"),
        learningFetch<StudySession[]>("/api/learning/planner/sessions"),
        learningFetch<StudyGoal[]>("/api/learning/planner/goals"),
        learningFetch<Certificate[]>("/api/certificates"),
      ]);
      if (cancelled) return;
      if (!dash.success || !dash.data) {
        setError(dash.error ?? "Unable to load dashboard");
        setOverview(null);
      } else {
        setOverview(dash.data);
        setError(null);
      }
      setCourses(courseRes.data ?? []);
      setCalendar(calRes.data ?? []);
      setSessions(sessionRes.data ?? []);
      setGoals(goalRes.data ?? []);
      setCertificates(certRes.data ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = firstNameOf(user?.firstName || user?.fullName, "Aviator");
  const greeting = greetingForHour(new Date(now).getHours());
  const resume = overview?.resume ?? null;
  const resumeHref = resume
    ? safePath(
        ["student", "courses", resume.courseId, "lessons", resume.lessonId],
        "/student/courses",
      )
    : "/student/courses";

  const currentCourse =
    courses.find((course) => course.id === resume?.courseId) ??
    courses.find((course) => (course.learning?.progressPercent ?? 0) > 0) ??
    courses[0] ??
    null;

  const completedLessons = courses.reduce(
    (sum, course) => sum + (course.learning?.completedLessons ?? 0),
    0,
  );
  const totalLessons = courses.reduce(
    (sum, course) => sum + (course.learning?.totalLessons ?? 0),
    0,
  );
  const weekly = goalHours(goals, "weekly");
  const monthly = goalHours(goals, "monthly");
  const days = weekDays(new Date(now));
  const plannerItems = calendar.length > 0 ? calendar : sessions.map(sessionToCalendar);
  const selectedTasks = plannerItems.filter((item) => sameDay(item.startsAt, selectedDay));
  const todayItems = calendar.filter((item) => sameDay(item.startsAt, now));
  const liveItem =
    calendar.find(
      (item) =>
        item.type === "live_class" &&
        (overview?.upcomingLiveClassId
          ? item.id.endsWith(overview.upcomingLiveClassId)
          : item.status === "upcoming"),
    ) ?? calendar.find((item) => item.type === "live_class");
  const liveStartsAt = liveItem?.startsAt ?? null;
  const instructorName = currentCourse?.primaryInstructorName ?? "EASA Certified Instructor";
  const filteredCourses = courses.filter((course) => {
    const percent = course.learning?.progressPercent ?? 0;
    if (filter === "progress") return percent > 0 && percent < 100;
    if (filter === "new") return percent === 0;
    if (filter === "done") return percent >= 100 || Boolean(course.learning?.completedAt);
    return true;
  });

  async function joinLive() {
    const classId = overview?.upcomingLiveClassId;
    if (!classId) return;
    setJoining(true);
    const result = await learningFetch<{ join?: { joinUrl?: string | null } | null }>(
      `/api/classes/${classId}/join`,
    );
    setJoining(false);
    const url = result.data?.join?.joinUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = "/student/calendar";
  }

  if (loading) {
    return (
      <div className="sl-dashboard" aria-busy="true" aria-live="polite">
        <div className="sl-skeleton" />
        <div className="sl-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="sl-skeleton" style={{ minHeight: 110 }} />
          ))}
        </div>
        <div className="sl-dashboard-grid">
          <div className="sl-skeleton" />
          <div className="sl-skeleton" />
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <section className="sl-card">
        <h1>Your learning workspace</h1>
        <p className="sl-muted">{error ?? "Dashboard data is unavailable right now."}</p>
        <Link className="sl-btn" href="/student/courses">
          Go to courses
        </Link>
      </section>
    );
  }

  return (
    <div className="sl-dashboard">
      <section className="sl-hero" aria-label="Welcome back">
        <div className="sl-hero-layout">
          <div className="sl-hero-copy">
            <p className="sl-kicker">Welcome back</p>
            <h1>
              {greeting}, {firstName} 👋
            </h1>
            <p>Keep going. You&apos;re one step closer to your cockpit.</p>
            <p className="sl-quote">“A good pilot is always a student.”</p>
            <div className="sl-hero-meta">
              <span className="sl-chip">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                {currentCourse?.title ?? resume?.courseTitle ?? "Choose your next course"}
              </span>
              <span className="sl-chip">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                {instructorName}
              </span>
              <span className="sl-chip">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {estimatedCompletion(overview.progressPercent)}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link className="sl-btn-gold" href={resumeHref}>
                <PlayCircle className="h-4 w-4" aria-hidden />
                Continue Learning
              </Link>
              <Link className="sl-btn-ghost" href="/student/planner">
                Open study planner
              </Link>
            </div>
          </div>
          <div className="sl-hero-aside" aria-hidden>
            <span>Discipline</span>
            <span>Knowledge</span>
            <span>Confidence</span>
            <strong>A brighter aviation future.</strong>
          </div>
        </div>
      </section>

      <section className="sl-stats" aria-label="Learning snapshot">
        <article className="sl-stat">
          <div className="sl-stat-top">
            Enrolled Courses
            <GraduationCap className="h-4 w-4" aria-hidden />
          </div>
          <strong>{overview.activeCourses}</strong>
          <span>Active courses</span>
        </article>
        <article className="sl-stat">
          <div className="sl-stat-top">
            Overall Progress
            <span className="sl-trend">
              +{Math.max(1, Math.round(overview.weeklyGoalPercent / 20))}%
            </span>
          </div>
          <strong>{clampPercent(overview.progressPercent)}%</strong>
          <div className="sl-mini-bar" aria-hidden>
            <i style={{ width: `${clampPercent(overview.progressPercent)}%` }} />
          </div>
        </article>
        <article className="sl-stat">
          <div className="sl-stat-top">
            Learning Hours
            <Clock3 className="h-4 w-4" aria-hidden />
          </div>
          <strong>{formatHours(overview.learningHours)}</strong>
          <span>This week {weekly.percent}% of goal</span>
        </article>
        <article className="sl-stat">
          <div className="sl-stat-top">
            Completed Lessons
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </div>
          <strong>{completedLessons}</strong>
          <span>Out of {totalLessons || overview.assignments || 0} lessons</span>
        </article>
      </section>

      <div className="sl-dashboard-grid">
        <div className="sl-stack">
          <section className="sl-card" aria-labelledby="continue-learning-title">
            <div className="sl-card-head">
              <h2 id="continue-learning-title">Continue Learning</h2>
              <Link href="/student/courses">View all</Link>
            </div>
            <div className="sl-continue">
              <div className="sl-continue-media">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote course art with local fallback */}
                <img
                  src={courseThumb(0, currentCourse?.coverImageUrl, currentCourse?.thumbnailUrl)}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = "/images/hero-aviation.svg";
                  }}
                />
              </div>
              <div>
                <h3>{resume?.courseTitle ?? currentCourse?.title ?? "Start your first lesson"}</h3>
                <p className="sl-muted">
                  Current lesson: {resume?.lessonTitle ?? "Pick a subject to resume"}
                </p>
                <p className="sl-muted">
                  Next lesson ready · {formatRemainingLessons(completedLessons, totalLessons)}
                </p>
                <div className="sl-progress" aria-hidden>
                  <i
                    style={{
                      width: `${clampPercent(currentCourse?.learning?.progressPercent ?? overview.progressPercent)}%`,
                    }}
                  />
                </div>
              </div>
              <Link className="sl-btn" href={resumeHref}>
                <PlayCircle className="h-4 w-4" aria-hidden />
                Continue Lesson
              </Link>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="today-learning-title">
            <div className="sl-card-head">
              <h2 id="today-learning-title">Today&apos;s Learning</h2>
              <span className="sl-muted">{todayItems.length} scheduled</span>
            </div>
            {todayItems.length === 0 ? (
              <div className="sl-empty">
                No live class or homework due today. Resume a lesson or open your planner.
              </div>
            ) : (
              <div className="sl-today-list">
                {todayItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="sl-today-item">
                    <span className="sl-dot" aria-hidden />
                    <div>
                      <strong>{item.title}</strong>
                      <p className="sl-muted">{calendarKindLabel(item.type)}</p>
                    </div>
                    <Link href={item.href ?? resumeHref}>Resume</Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sl-card" aria-labelledby="course-progress-title">
            <div className="sl-card-head">
              <h2 id="course-progress-title">Course Progress</h2>
            </div>
            <div className="sl-progress-panel">
              <ProgressRing
                value={overview.progressPercent}
                label={`Overall completion ${clampPercent(overview.progressPercent)} percent`}
              />
              <div className="sl-today-list">
                <div className="sl-today-item">
                  <span className="sl-dot" aria-hidden />
                  <div>
                    <strong>Current subject</strong>
                    <p className="sl-muted">{currentCourse?.title ?? "Not started"}</p>
                  </div>
                </div>
                <div className="sl-today-item">
                  <span className="sl-dot" aria-hidden />
                  <div>
                    <strong>
                      {completedLessons} / {totalLessons || "—"}
                    </strong>
                    <p className="sl-muted">Completed lessons</p>
                  </div>
                </div>
                <div className="sl-today-item">
                  <span className="sl-dot" aria-hidden />
                  <div>
                    <strong>{formatHours(overview.learningHours)}</strong>
                    <p className="sl-muted">
                      Weekly {weekly.percent}% · Monthly {monthly.percent}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="my-courses-title">
            <div className="sl-card-head">
              <h2 id="my-courses-title">My Courses</h2>
              <div className="sl-tabs" role="tablist" aria-label="Filter courses">
                {(
                  [
                    ["all", "All Courses"],
                    ["progress", "In Progress"],
                    ["new", "Not Started"],
                    ["done", "Completed"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="sl-tab"
                    role="tab"
                    data-active={filter === key ? "true" : "false"}
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {filteredCourses.length === 0 ? (
              <div className="sl-empty">No courses in this view yet.</div>
            ) : (
              <div className="sl-courses-grid">
                {filteredCourses.slice(0, 4).map((course, index) => {
                  const percent = clampPercent(course.learning?.progressPercent ?? 0);
                  const href = course.learning?.lastLessonId
                    ? safePath(
                        ["student", "courses", course.id, "lessons", course.learning.lastLessonId],
                        "/student/courses",
                      )
                    : safePath(["student", "courses", course.id], "/student/courses");
                  return (
                    <Link key={course.id} href={href} className="sl-course-card">
                      <div className="sl-course-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote course art with local fallback */}
                        <img
                          src={courseThumb(index, course.coverImageUrl, course.thumbnailUrl)}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.src = "/images/hero-aviation.svg";
                          }}
                        />
                      </div>
                      <h3>{course.title}</h3>
                      <p className="sl-muted">
                        {percent >= 100
                          ? "Completed"
                          : percent > 0
                            ? "In progress"
                            : "Ready to start"}{" "}
                        · {course.counts.lessons || course.learning?.totalLessons || 0} lessons
                      </p>
                      <div className="sl-progress" aria-hidden>
                        <i style={{ width: `${percent}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sl-card" aria-labelledby="achievements-title">
            <div className="sl-card-head">
              <h2 id="achievements-title">Achievements</h2>
              <Link href="/student/certificates">Certificates</Link>
            </div>
            <div className="sl-achievements">
              <div className="sl-badge">
                <strong>{certificates.length}</strong>
                <span className="sl-muted">Certificates</span>
              </div>
              <div className="sl-badge">
                <strong>{overview.completedCourses}</strong>
                <span className="sl-muted">Completed subjects</span>
              </div>
              <div className="sl-badge">
                <strong>{Math.max(1, Math.round(overview.learningHours) || 1)}</strong>
                <span className="sl-muted">Learning streak days</span>
              </div>
              <div className="sl-badge">
                <strong>{formatHours(overview.learningHours)}</strong>
                <span className="sl-muted">Study hours</span>
              </div>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="recent-activity-title">
            <div className="sl-card-head">
              <h2 id="recent-activity-title">Recent Activity</h2>
              <Link href="/student/history">History</Link>
            </div>
            {overview.recentActivity.length === 0 ? (
              <div className="sl-empty">
                Your completed lessons, quizzes, and feedback will appear here.
              </div>
            ) : (
              <div className="sl-activity-list">
                {overview.recentActivity.slice(0, 6).map((event: LearningHistoryEvent) => (
                  <div key={event.id} className="sl-activity-item">
                    <Award className="h-4 w-4" aria-hidden />
                    <div>
                      <strong>{event.title}</strong>
                      <p className="sl-muted">{activityKindLabel(event.type)}</p>
                    </div>
                    <span className="sl-muted">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="sl-stack">
          <section className="sl-card sl-live-card" aria-labelledby="live-session-title">
            <div className="sl-live-top">
              <h2 id="live-session-title">Upcoming Live Session</h2>
              <span className="sl-live">Live</span>
            </div>
            <div className="sl-instructor">
              <span className="sl-instructor-fallback" aria-hidden>
                {initialsOf(instructorName)}
              </span>
              <div>
                <strong>{instructorName}</strong>
                <p className="sl-muted">EASA Certified</p>
              </div>
            </div>
            <p>
              {overview.upcomingLiveClass ??
                liveItem?.title ??
                "No live session is scheduled yet. Check the calendar for the next briefing."}
            </p>
            <p className="sl-muted">Countdown: {countdownLabel(liveStartsAt, now)}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="sl-btn-gold"
                onClick={() => void joinLive()}
                disabled={!overview.upcomingLiveClassId || joining}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {joining ? "Joining…" : "Join Session"}
              </button>
              <Link className="sl-btn" href="/student/calendar">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Calendar
              </Link>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="study-planner-title">
            <div className="sl-card-head">
              <h2 id="study-planner-title">Study Planner</h2>
              <Link href="/student/planner">Open</Link>
            </div>
            <div className="sl-week" role="tablist" aria-label="This week">
              {days.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  className="sl-day"
                  role="tab"
                  data-active={sameDay(day.iso, selectedDay) ? "true" : "false"}
                  aria-selected={sameDay(day.iso, selectedDay)}
                  onClick={() => setSelectedDay(day.iso)}
                >
                  <span>{day.label}</span>
                  <strong>{day.date}</strong>
                </button>
              ))}
            </div>
            <div className="sl-task-list" style={{ marginTop: 14 }}>
              {selectedTasks.length === 0 ? (
                <div className="sl-empty">No study reminders or exams on this day.</div>
              ) : (
                selectedTasks.slice(0, 5).map((item) => (
                  <div key={item.id} className="sl-task-item">
                    <span className="sl-dot" aria-hidden />
                    <div>
                      <strong>{item.title}</strong>
                      <p className="sl-muted">{calendarKindLabel(item.type)}</p>
                    </div>
                    <span className="sl-muted">
                      {new Date(item.startsAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="sl-card" aria-labelledby="quick-actions-title">
            <h2 id="quick-actions-title">Quick Actions</h2>
            <div className="sl-actions" style={{ marginTop: 14 }}>
              <Link className="sl-action" href="/student/bookings">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Book a Session
              </Link>
              <Link className="sl-action" href="/student/mock-exams">
                <GraduationCap className="h-4 w-4" aria-hidden />
                Take a Mock Exam
              </Link>
              <Link className="sl-action" href="/student/resources">
                <Download className="h-4 w-4" aria-hidden />
                Download Materials
              </Link>
              <Link className="sl-action" href="/student/support">
                <Headset className="h-4 w-4" aria-hidden />
                Support
              </Link>
              <Link className="sl-action" href="/student/messages">
                <MessageSquare className="h-4 w-4" aria-hidden />
                Messages
              </Link>
              <Link className="sl-action" href="/student/certificates">
                <Award className="h-4 w-4" aria-hidden />
                Certificates
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function sessionToCalendar(session: StudySession): LearningCalendarItem {
  return {
    id: `session-${session.id}`,
    title: session.title,
    type: "study_session",
    startsAt: session.scheduledStart,
    endsAt: session.scheduledEnd,
    status: session.completed ? "completed" : "upcoming",
    href: "/student/planner",
    courseId: session.courseId,
  };
}

export { LearningDashboardView };
