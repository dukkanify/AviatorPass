"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Award,
  BookOpen,
  Clock3,
  Flame,
  GraduationCap,
  Headset,
  Hexagon,
  Lock,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Trophy,
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
  firstNameOf,
  formatHeroClock,
  formatHoursMinutes,
  greetingForHour,
  HERO_IMAGE,
  initialsOf,
  learningStreak,
  pilotLevelFromXp,
  relativeTime,
  sameDay,
  weatherForCountry,
} from "./student-dashboard-utils";

type CourseRow = CourseListItem & { learning: CourseLearningState | null };

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  bar,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  trend: string;
  bar?: number;
}) {
  return (
    <article className="sl-stat">
      <span className="sl-stat-icon" aria-hidden>
        {icon}
      </span>
      <div className="sl-stat-copy">
        <div className="sl-stat-top">{label}</div>
        <strong>{value}</strong>
        <span>{hint}</span>
        {typeof bar === "number" ? (
          <div className="sl-mini-bar" aria-hidden>
            <i style={{ width: `${clampPercent(bar)}%` }} />
          </div>
        ) : null}
      </div>
      <span className="sl-trend" data-tone={trend === "—" ? "flat" : "up"}>
        {trend}
      </span>
    </article>
  );
}

function LearningDashboardView() {
  const { user } = useAuth();
  const [overview, setOverview] = React.useState<LearningDashboardOverview | null>(null);
  const [courses, setCourses] = React.useState<CourseRow[]>([]);
  const [calendar, setCalendar] = React.useState<LearningCalendarItem[]>([]);
  const [sessions, setSessions] = React.useState<StudySession[]>([]);
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
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
      const [dash, courseRes, calRes, sessionRes, certRes] = await Promise.all([
        learningFetch<LearningDashboardOverview>("/api/learning/dashboard"),
        learningFetch<CourseRow[]>("/api/learning/courses?sort=recent"),
        learningFetch<LearningCalendarItem[]>("/api/learning/calendar"),
        learningFetch<StudySession[]>("/api/learning/planner/sessions"),
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
  const plannerItems = calendar.length > 0 ? calendar : sessions.map(sessionToCalendar);
  const todayItems = plannerItems.filter((item) => sameDay(item.startsAt, now));
  const liveItem =
    calendar.find(
      (item) =>
        item.type === "live_class" &&
        (overview?.upcomingLiveClassId
          ? item.id.endsWith(overview.upcomingLiveClassId)
          : item.status === "upcoming"),
    ) ?? calendar.find((item) => item.type === "live_class");
  const liveStartsAt = liveItem?.startsAt ?? null;
  const instructorName = currentCourse?.primaryInstructorName ?? "Khalid Al Rashid";
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
  const streak = Math.max(learningStreak(activityDates, new Date(now)), overview ? 1 : 0);
  const gpa = academicGpa(overview?.progressPercent ?? 0, completedLessons);
  const hasEnrolledCourses = courses.length > 0;
  const continueTitle = resume?.courseTitle ?? currentCourse?.title ?? "Start your first course";
  const continueProgress = clampPercent(
    currentCourse?.learning?.progressPercent ?? overview?.progressPercent ?? 0,
  );
  const continueLesson =
    resume?.lessonTitle ??
    (totalLessons
      ? `Lesson ${Math.max(1, completedLessons + 1)} of ${totalLessons}`
      : "Open your next briefing");

  const schedulePicks = [
    todayItems.find((item) => item.type === "live_class") ?? liveItem,
    todayItems.find((item) => item.type === "study_session" || item.type === "lesson"),
    todayItems.find((item) => item.type === "deadline") ??
      plannerItems.find((item) => item.type === "deadline"),
  ].filter((item, index, list): item is LearningCalendarItem => {
    return Boolean(item) && list.findIndex((candidate) => candidate?.id === item?.id) === index;
  });

  const mappedSchedule = (
    schedulePicks.length >= 2 ? schedulePicks.slice(0, 3) : todayItems.slice(0, 3)
  ).map((item) => ({
    id: item.id,
    time: new Date(item.startsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    title: calendarKindLabel(item.type),
    detail: item.title,
    href: item.href ?? (item.type === "live_class" ? "/student/calendar" : resumeHref),
    live: item.type === "live_class",
    action: item.type === "live_class" ? "Join" : item.type === "deadline" ? "Start" : null,
  }));

  const schedule =
    mappedSchedule.length > 0
      ? mappedSchedule
      : [
          {
            id: "live",
            time: "10:00 AM",
            title: "Live Class",
            detail: continueTitle,
            href: "/student/calendar",
            live: true,
            action: "Join",
          },
          {
            id: "study",
            time: "02:00 PM",
            title: "Self Study",
            detail: continueTitle,
            href: resumeHref,
            live: false,
            action: null,
          },
          {
            id: "exam",
            time: "05:00 PM",
            title: "Mock Exam",
            detail: "Timed practice paper",
            href: "/student/mock-exams",
            live: false,
            action: "Start",
          },
        ];

  const achievements = [
    {
      id: "first-steps",
      title: "First Steps",
      unlocked: completedLessons > 0 || continueProgress > 0,
    },
    {
      id: "consistent",
      title: "Consistent Learner",
      unlocked: streak >= 3 || (overview?.learningHours ?? 0) >= 4,
    },
    { id: "exam-ready", title: "Exam Ready", unlocked: (overview?.progressPercent ?? 0) >= 80 },
  ];

  async function joinLive() {
    const classId = overview?.upcomingLiveClassId;
    if (!classId) {
      window.location.href = "/student/calendar";
      return;
    }
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
        <div className="sl-skeleton" style={{ minHeight: 420 }} />
        <div className="sl-stats">
          {Array.from({ length: 8 }).map((_, index) => (
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
      {!hasEnrolledCourses ? (
        <section
          className="sl-card"
          aria-label="Welcome to Aviator Pass"
          style={{ marginBottom: 16 }}
        >
          <p className="sl-kicker" style={{ color: "var(--sl-gold-deep)" }}>
            Welcome to Aviator Pass!
          </p>
          <h2 style={{ marginTop: 6 }}>Start by enrolling in your first course.</h2>
          <p className="sl-muted">
            Browse available programmes or open the ATPL course to begin your aviation journey.
          </p>
          <div className="sl-hero-actions" style={{ marginTop: 14 }}>
            <Link className="sl-btn-gold" href="/courses">
              Browse Courses
            </Link>
            <Link className="sl-btn-ghost" href="/atpl">
              Explore ATPL Course
            </Link>
          </div>
        </section>
      ) : null}
      <motion.section
        className="sl-hero sl-hero--command"
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
        <div className="sl-hero-weather">
          <p>
            {weather.city}, {weather.country}
          </p>
          <strong>
            {weather.icon} {weather.tempC}°C, {weather.sky}
          </strong>
          <span>{formatHeroClock(new Date(now))}</span>
        </div>
        <div className="sl-hero-copy">
          <p className="sl-kicker">Welcome back</p>
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Keep going. You&apos;re one step closer to your cockpit.</p>
          <blockquote className="sl-hero-quote">
            <p>“{quote}”</p>
            <cite>— Unknown</cite>
          </blockquote>
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
            <Link className="sl-btn-ghost" href="/student/courses">
              Explore Courses
            </Link>
          </div>
        </div>
        <p className="sl-hero-brandline">
          Discipline · Knowledge · Confidence · A brighter aviation future
        </p>
      </motion.section>

      <section className="sl-stats" aria-label="Learning snapshot">
        <StatCard
          label="Enrolled Courses"
          value={String(overview.activeCourses)}
          hint="Active courses"
          icon={<BookOpen className="h-4 w-4" />}
          trend={overview.activeCourses > 0 ? "+2" : "—"}
        />
        <StatCard
          label="Overall Progress"
          value={`${clampPercent(overview.progressPercent)}%`}
          hint="Across all courses"
          icon={<TrendingUp className="h-4 w-4" />}
          trend="+5%"
          bar={overview.progressPercent}
        />
        <StatCard
          label="Learning Hours"
          value={formatHoursMinutes(overview.learningHours)}
          hint="Logged this term"
          icon={<Clock3 className="h-4 w-4" />}
          trend="+12%"
        />
        <StatCard
          label="Completed Lessons"
          value={String(completedLessons)}
          hint={`Out of ${totalLessons || 32} lessons`}
          icon={<GraduationCap className="h-4 w-4" />}
          trend={completedLessons > 0 ? "+33%" : "—"}
        />
        <StatCard
          label="Certificates"
          value={String(certificates.length)}
          hint={certificates.length > 0 ? "Ready to download" : "Earned so far"}
          icon={<Award className="h-4 w-4" />}
          trend={certificates.length > 0 ? `+${certificates.length}` : "—"}
        />
        <StatCard
          label="Current GPA"
          value={gpa.toFixed(1)}
          hint={gpa >= 3.7 ? "Excellent" : "Building"}
          icon={<Trophy className="h-4 w-4" />}
          trend={overview.progressPercent > 0 ? "+0.3" : "—"}
        />
        <StatCard
          label="Learning Streak"
          value={`${streak} days`}
          hint="Keep it up!"
          icon={<Flame className="h-4 w-4" />}
          trend={streak > 0 ? `+${Math.min(streak, 3)}` : "—"}
        />
        <StatCard
          label="Pilot Level"
          value={level.name}
          hint={`${xp.toLocaleString()} / ${level.nextXp.toLocaleString()} XP`}
          icon={<Sparkles className="h-4 w-4" />}
          trend={`+${xp}`}
          bar={level.percent}
        />
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
                <p className="sl-kicker" style={{ color: "var(--sl-gold-deep)" }}>
                  {hasEnrolledCourses ? "In progress" : "Get started"}
                </p>
                <h3>{continueTitle}</h3>
                <p className="sl-muted">
                  {hasEnrolledCourses
                    ? continueLesson
                    : "Browse available courses and enrol to unlock lessons here."}
                </p>
                {hasEnrolledCourses ? (
                  <>
                    <div className="sl-progress" aria-hidden>
                      <i style={{ width: `${continueProgress}%` }} />
                    </div>
                    <p className="sl-muted">{continueProgress}% complete</p>
                  </>
                ) : null}
              </div>
              <Link className="sl-btn-navy" href={hasEnrolledCourses ? resumeHref : "/courses"}>
                <PlayCircle className="h-4 w-4" aria-hidden />
                {hasEnrolledCourses ? "Continue Lesson" : "Browse Courses"}
              </Link>
            </div>
          </section>

          <div className="sl-command-split">
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
                  {overview.recentActivity.slice(0, 5).map((event: LearningHistoryEvent) => (
                    <div key={event.id} className="sl-activity-item">
                      <span className="sl-activity-mark" data-kind={event.type} aria-hidden />
                      <div>
                        <strong>{event.title}</strong>
                        <p className="sl-muted">{activityKindLabel(event.type)}</p>
                      </div>
                      <span className="sl-muted">{relativeTime(event.createdAt, now)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="sl-card" aria-labelledby="achievements-title">
              <div className="sl-card-head">
                <h2 id="achievements-title">Achievements</h2>
                <Link href="/student/certificates#achievements">View all</Link>
              </div>
              <div className="sl-hex-grid">
                {achievements.map((item) => (
                  <article
                    key={item.id}
                    className="sl-hex"
                    data-locked={item.unlocked ? "false" : "true"}
                  >
                    <span className="sl-hex-shape" aria-hidden>
                      {item.unlocked ? (
                        <Hexagon className="h-6 w-6" />
                      ) : (
                        <Lock className="h-5 w-5" />
                      )}
                    </span>
                    <strong>{item.title}</strong>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="sl-stack" aria-label="Today and support">
          <section className="sl-card" aria-labelledby="today-learning-title">
            <div className="sl-card-head">
              <h2 id="today-learning-title">Today&apos;s Schedule</h2>
              <Link href="/student/calendar">Open</Link>
            </div>
            <div className="sl-today-list">
              {schedule.map((item) => (
                <div
                  key={item.id}
                  className="sl-today-item"
                  data-live={item.live ? "true" : "false"}
                >
                  <time className="sl-muted">{item.time}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="sl-muted">{item.detail}</p>
                  </div>
                  {item.action ? (
                    item.live ? (
                      <button
                        type="button"
                        className="sl-schedule-action"
                        onClick={() => void joinLive()}
                        disabled={joining}
                      >
                        {joining ? "Joining…" : item.action}
                      </button>
                    ) : (
                      <Link className="sl-schedule-action" href={item.href}>
                        {item.action}
                      </Link>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="sl-card sl-live-card" aria-labelledby="live-session-title">
            <div className="sl-live-top">
              <p className="sl-kicker" style={{ margin: 0 }}>
                Upcoming Live Session
              </p>
              <span className="sl-live">{liveStartsAt ? "Live" : "Standby"}</span>
            </div>
            <div className="sl-instructor">
              <span className="sl-instructor-fallback" aria-hidden>
                {initialsOf(instructorName)}
              </span>
              <div>
                <strong>{instructorName}</strong>
                <p className="sl-muted">Instructor</p>
              </div>
            </div>
            <h2 id="live-session-title">
              {overview.upcomingLiveClass ?? liveItem?.title ?? "ATPL 010 — Air Law (Live)"}
            </h2>
            <p className="sl-muted">
              {liveStartsAt
                ? `${countdownLabel(liveStartsAt, now)} · ${liveItem?.title ?? "Live briefing"}`
                : "No live class is booked yet — open the calendar to reserve a seat."}
            </p>
            <button
              type="button"
              className="sl-btn-gold"
              onClick={() => void joinLive()}
              disabled={joining}
            >
              {joining ? "Joining…" : "Join Live Session"}
            </button>
          </section>

          <section className="sl-card sl-help-card">
            <span className="sl-help-icon" aria-hidden>
              <Headset className="h-5 w-5" />
            </span>
            <h2>Need Help?</h2>
            <p className="sl-muted">
              Our academy team can unblock your next lesson, booking, or exam attempt.
            </p>
            <Link href="/student/support">
              Contact Support
              <span aria-hidden>→</span>
            </Link>
          </section>
        </aside>
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
