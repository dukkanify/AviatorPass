"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Award,
  Bookmark,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Flame,
  GraduationCap,
  Headset,
  Lock,
  Plane,
  PlayCircle,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Video,
  Zap,
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
  academicGpa,
  activityKindLabel,
  calendarKindLabel,
  clampPercent,
  computeXp,
  countdownLabel,
  courseThumb,
  dailyMotivationQuote,
  daysRemaining,
  estimatedCompletion,
  firstNameOf,
  formatHours,
  formatRemainingLessons,
  goalHours,
  greetingForHour,
  heatmapFromDates,
  HERO_IMAGE,
  initialsOf,
  learningStreak,
  lessonTimeline,
  nextFlightMilestone,
  pilotLevelFromXp,
  sameDay,
  weatherForCountry,
  weekDays,
} from "./student-dashboard-utils";

type CourseRow = CourseListItem & { learning: CourseLearningState | null };
type CourseFilter = "all" | "progress" | "new" | "done";

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function useCountUp(value: number, duration = 700) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const p = Math.min(1, (time - start) / duration);
      setN(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

function StatCard({
  label,
  value,
  hint,
  icon,
  suffix = "",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  suffix?: string;
}) {
  const shown = useCountUp(value);
  return (
    <article className="sl-stat">
      <div className="sl-stat-top">
        {label}
        {icon}
      </div>
      <strong>
        {shown}
        {suffix}
      </strong>
      <span>{hint}</span>
    </article>
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
  const [dismissedNoticeIds, setDismissedNoticeIds] = React.useState<string[]>([]);

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
  const activityDates = [
    ...(overview?.recentActivity.map((event) => event.createdAt) ?? []),
    ...sessions.map((session) => session.scheduledStart),
    ...calendar.map((item) => item.startsAt),
  ];
  const xp = computeXp({
    completedLessons,
    learningHours: overview?.learningHours ?? 0,
    certificates: certificates.length,
    progressPercent: overview?.progressPercent ?? 0,
  });
  const level = pilotLevelFromXp(xp);
  const weather = weatherForCountry(user?.countryCode);
  const quote = dailyMotivationQuote(new Date(now));
  const heatmap = heatmapFromDates(activityDates);
  const streak = Math.max(learningStreak(activityDates, new Date(now)), overview ? 1 : 0);
  const remainingDays = daysRemaining(overview?.progressPercent ?? 0);
  const gpa = academicGpa(overview?.progressPercent ?? 0, completedLessons);
  const upcomingExams = calendar.filter((item) => item.type === "deadline").length;
  const steps = lessonTimeline(
    currentCourse?.learning?.completedLessons ?? completedLessons,
    currentCourse?.learning?.totalLessons ?? totalLessons,
    resume?.lessonTitle ?? "Current lesson",
  );
  const notices = (overview?.recentActivity ?? [])
    .slice(0, 5)
    .filter((event) => !dismissedNoticeIds.includes(event.id));

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
        <div className="sl-skeleton" style={{ minHeight: 340 }} />
        <div className="sl-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="sl-skeleton" style={{ minHeight: 120 }} />
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
      <motion.section
        className="sl-hero"
        aria-label="Welcome back"
        initial="hidden"
        animate="show"
        variants={fade}
      >
        <div className="sl-hero-media" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative hero art */}
          <img src={HERO_IMAGE} alt="" loading="eager" />
        </div>
        <div className="sl-hero-overlay" aria-hidden />
        <div className="sl-hero-copy">
          <p className="sl-kicker">Welcome back,</p>
          <h1>
            {greeting} {firstName} 👋
          </h1>
          <p className="sl-quote">“{quote}”</p>
          <div className="sl-hero-facts">
            <div className="sl-fact">
              <span>Student Level</span>
              <strong>{level.name}</strong>
            </div>
            <div className="sl-fact">
              <span>Current Course</span>
              <strong>{currentCourse?.title ?? resume?.courseTitle ?? "Choose a course"}</strong>
            </div>
            <div className="sl-fact">
              <span>Instructor</span>
              <strong>{instructorName}</strong>
            </div>
            <div className="sl-fact">
              <span>Progress</span>
              <strong>{clampPercent(overview.progressPercent)}%</strong>
            </div>
            <div className="sl-fact">
              <span>Days Remaining</span>
              <strong>{remainingDays || "Done"}</strong>
            </div>
          </div>
          <div className="sl-hero-actions">
            <Link className="sl-btn-gold" href={resumeHref}>
              <PlayCircle className="h-4 w-4" aria-hidden />
              Continue Learning
            </Link>
            <Link className="sl-btn-ghost" href="/student/planner">
              Open Planner
            </Link>
            <Link className="sl-btn-ghost" href="/student/calendar">
              View Schedule
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="sl-insight-row" aria-label="Pilot insights">
        <article className="sl-insight">
          <span className="sl-muted">Daily motivation</span>
          <strong>{quote}</strong>
        </article>
        <article className="sl-insight">
          <span className="sl-muted">
            <Sun className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Current weather
          </span>
          <strong>{weather.label}</strong>
        </article>
        <article className="sl-insight">
          <span className="sl-muted">Next flight milestone</span>
          <strong>{nextFlightMilestone(overview.progressPercent)}</strong>
        </article>
        <article className="sl-insight">
          <span className="sl-muted">Pilot level</span>
          <strong>
            {level.name} · {xp} XP
          </strong>
          <div className="sl-mini-bar" aria-hidden>
            <i style={{ width: `${level.percent}%` }} />
          </div>
        </article>
      </section>

      <section className="sl-stats" aria-label="Learning snapshot">
        <StatCard
          label="Enrolled Courses"
          value={overview.activeCourses}
          hint="Active courses"
          icon={<GraduationCap className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Completed Lessons"
          value={completedLessons}
          hint={`Out of ${totalLessons || overview.assignments || 0} lessons`}
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Learning Hours"
          value={Number(overview.learningHours.toFixed(0))}
          hint={`This week ${weekly.percent}% of goal`}
          icon={<Clock3 className="h-4 w-4" aria-hidden />}
          suffix="h"
        />
        <StatCard
          label="Certificates"
          value={certificates.length}
          hint={`${overview.completedCourses} subjects complete`}
          icon={<Award className="h-4 w-4" aria-hidden />}
        />
        <article className="sl-stat">
          <div className="sl-stat-top">
            Current GPA
            <span className="sl-trend">
              +{Math.max(1, Math.round(overview.weeklyGoalPercent / 20))}%
            </span>
          </div>
          <strong>{gpa.toFixed(2)}</strong>
          <span>Academic standing</span>
        </article>
        <article className="sl-stat">
          <div className="sl-stat-top">
            Progress
            <Target className="h-4 w-4" aria-hidden />
          </div>
          <strong>{clampPercent(overview.progressPercent)}%</strong>
          <div className="sl-mini-bar" aria-hidden>
            <i style={{ width: `${clampPercent(overview.progressPercent)}%` }} />
          </div>
        </article>
        <StatCard
          label="Weekly Goal"
          value={weekly.percent}
          hint={`${weekly.completed}h / ${weekly.target || 0}h`}
          icon={<Flame className="h-4 w-4" aria-hidden />}
          suffix="%"
        />
        <StatCard
          label="Upcoming Exams"
          value={upcomingExams}
          hint={`${streak} day learning streak`}
          icon={<FileText className="h-4 w-4" aria-hidden />}
        />
      </section>

      <section className="sl-card" aria-labelledby="quick-actions-title">
        <div className="sl-card-head">
          <h2 id="quick-actions-title">Quick Actions</h2>
        </div>
        <div className="sl-actions">
          <Link className="sl-action" href={resumeHref}>
            <PlayCircle className="h-4 w-4" aria-hidden />
            Continue Course
          </Link>
          <Link className="sl-action" href="/student/calendar">
            <Video className="h-4 w-4" aria-hidden />
            Join Live Class
          </Link>
          <Link className="sl-action" href="/student/resources">
            <Download className="h-4 w-4" aria-hidden />
            Download Materials
          </Link>
          <Link className="sl-action" href="/student/support">
            <Headset className="h-4 w-4" aria-hidden />
            Support
          </Link>
          <Link className="sl-action" href="/student/certificates">
            <Award className="h-4 w-4" aria-hidden />
            Certificates
          </Link>
          <Link className="sl-action" href="/student/assignments">
            <FileText className="h-4 w-4" aria-hidden />
            Assignments
          </Link>
          <Link className="sl-action" href="/student/calendar">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Calendar
          </Link>
          <Link className="sl-action" href="/student/favorites">
            <Bookmark className="h-4 w-4" aria-hidden />
            Bookmarks
          </Link>
        </div>
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
              <h2 id="today-learning-title">Today&apos;s schedule</h2>
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
                    <Link href={item.href ?? resumeHref}>Open</Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sl-card" aria-labelledby="course-progress-title">
            <div className="sl-card-head">
              <h2 id="course-progress-title">Course Progress</h2>
              <span className="sl-muted">{estimatedCompletion(overview.progressPercent)}</span>
            </div>
            <div className="sl-progress-panel">
              <div className="sl-timeline" aria-label="Lesson timeline">
                {steps.map((step) => (
                  <div key={step.id} className="sl-lesson-step" data-state={step.state}>
                    <span className="sl-step-mark" aria-hidden>
                      {step.state === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : step.state === "locked" ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        step.index
                      )}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <p className="sl-muted">
                        {step.state === "completed"
                          ? "Completed lesson"
                          : step.state === "current"
                            ? "Current lesson"
                            : "Locked lesson"}
                      </p>
                    </div>
                    <span className="sl-muted">{step.state}</span>
                  </div>
                ))}
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
                    <span className="sl-activity-mark" data-kind={event.type} aria-hidden />
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
              <span className="sl-live">{liveStartsAt ? "Live" : "Standby"}</span>
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
            <div className="sl-live-icons" aria-hidden>
              <Plane className="h-4 w-4" />
              <Video className="h-4 w-4" />
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="sl-hero-actions">
              <button
                type="button"
                className="sl-btn-gold"
                onClick={() => void joinLive()}
                disabled={!overview.upcomingLiveClassId || joining}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {joining ? "Joining…" : "Join"}
              </button>
              <Link className="sl-btn" href="/student/calendar">
                Calendar
              </Link>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="notifications-title">
            <div className="sl-card-head">
              <h2 id="notifications-title">Notifications</h2>
              <Link href="/student/notifications">View all</Link>
            </div>
            {notices.length === 0 ? (
              <div className="sl-empty">You&apos;re all caught up.</div>
            ) : (
              <div className="sl-notice-list">
                {notices.map((event) => (
                  <div key={event.id} className="sl-notice-item">
                    <span className="sl-activity-mark" data-kind={event.type} aria-hidden />
                    <div>
                      <strong>{event.title}</strong>
                      <p className="sl-muted">{activityKindLabel(event.type)}</p>
                    </div>
                    <button
                      type="button"
                      className="sl-icon-btn"
                      aria-label={`Dismiss ${event.title}`}
                      onClick={() =>
                        setDismissedNoticeIds((ids) =>
                          ids.includes(event.id) ? ids : [...ids, event.id],
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
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

          <section className="sl-card" aria-labelledby="achievements-title">
            <div className="sl-card-head">
              <h2 id="achievements-title">Achievements</h2>
              <Link href="/student/certificates">Recent certificates</Link>
            </div>
            <div className="sl-achievements">
              <div className="sl-badge">
                <Trophy className="h-4 w-4" aria-hidden />
                <strong>{certificates.length}</strong>
                <span className="sl-muted">Certificates</span>
              </div>
              <div className="sl-badge">
                <Flame className="h-4 w-4" aria-hidden />
                <strong>{streak}</strong>
                <span className="sl-muted">Learning streak</span>
              </div>
              <div className="sl-badge">
                <Zap className="h-4 w-4" aria-hidden />
                <strong>{xp}</strong>
                <span className="sl-muted">XP points</span>
              </div>
              <div className="sl-badge">
                <BookOpen className="h-4 w-4" aria-hidden />
                <strong>{formatHours(overview.learningHours)}</strong>
                <span className="sl-muted">Study hours</span>
              </div>
            </div>
          </section>

          <section className="sl-card" aria-labelledby="heatmap-title">
            <div className="sl-card-head">
              <h2 id="heatmap-title">Learning heatmap</h2>
              <span className="sl-muted">Last 12 weeks</span>
            </div>
            <div className="sl-heatmap" aria-hidden>
              {Array.from({ length: 12 }, (_, week) => (
                <div key={week} className="sl-heat-col">
                  {heatmap.slice(week * 7, week * 7 + 7).map((cell) => (
                    <span
                      key={cell.key}
                      className="sl-heat"
                      data-level={
                        cell.count >= 3 ? "3" : cell.count >= 2 ? "2" : cell.count ? "1" : "0"
                      }
                    />
                  ))}
                </div>
              ))}
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
