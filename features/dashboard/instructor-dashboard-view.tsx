"use client";

import * as React from "react";
import { AlertCircle, CalendarPlus, CheckCircle2, ChevronDown, Users, Video } from "lucide-react";

import Link from "@/components/ui/app-link";
import { MarkSubjectCompleteButton } from "@/features/classes/components/mark-subject-complete-button";
import { PageHeader } from "@/components/shared/page-header";
import {
  StatCard,
  ChartCard,
  BarsChart,
  CalendarWidget,
  type SeriesPoint,
  type CalendarEvent,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LectureCard {
  id: string;
  studentName: string;
  studentEmail: string;
  label: string | null;
  onTimetable: boolean;
  subjectTitle?: string;
  liveClassId?: string | null;
  studentId: string;
  windowEnded: boolean;
}

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
  firstLectures?: LectureCard[];
}

function QueueSection({
  id,
  step,
  title,
  hint,
  count,
  tone = "neutral",
  children,
}: {
  id: string;
  step: number;
  title: string;
  hint: string;
  count: number;
  tone?: "neutral" | "action" | "ok";
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(count > 0 || step === 1);

  React.useEffect(() => {
    if (count > 0) setOpen(true);
  }, [count]);

  return (
    <section id={id} className="overflow-hidden rounded-2xl border border-border/80 bg-card/70">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">
              {title}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                count > 0 && tone === "action" && "border-accent/40 bg-accent/10 text-accent",
                count === 0 &&
                  tone === "ok" &&
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
              )}
            >
              {count}
            </Badge>
          </div>
          {open ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-border/70 px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function LectureTaskCard({ lecture }: { lecture: LectureCard }) {
  const status = lecture.windowEnded
    ? "Time ended"
    : lecture.onTimetable
      ? "On timetable"
      : "Assigned";

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Student
          </p>
          <p className="font-medium">{lecture.studentName}</p>
          <p className="truncate text-xs text-muted-foreground">{lecture.studentEmail}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {status}
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Subject
          </p>
          <p className="font-medium">{lecture.subjectTitle || "ATPL lecture"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            When
          </p>
          <p className="text-sm text-muted-foreground">{lecture.label ?? "Time confirmed"}</p>
        </div>
      </div>

      {lecture.liveClassId ? (
        <div className="mt-4 space-y-2">
          {lecture.windowEnded ? (
            <p className="text-sm text-muted-foreground">
              Lecture time ended. Mark the subject complete so it does not open again. TKI 1 books
              the next subject after you agree a time — or use Unable to Schedule on the class page
              if you cannot take it.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Join when the lecture starts. After class, open the class page for the performance
              report.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!lecture.windowEnded ? (
              <Button asChild>
                <Link href={`/join/${lecture.liveClassId}`}>Join Zoom</Link>
              </Button>
            ) : (
              <MarkSubjectCompleteButton
                liveClassId={lecture.liveClassId}
                studentId={lecture.studentId}
              />
            )}
            <Button asChild variant="outline">
              <Link href={`/instructor/classes/${lecture.liveClassId}`}>
                {lecture.windowEnded
                  ? "Class page · Unable to Schedule"
                  : "Performance and next session"}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Waiting for the live class link. Check Schedule if the time was just confirmed.
        </p>
      )}
    </li>
  );
}

function InstructorDashboardView({
  overview,
  attendance,
  calendar,
  firstLectures = [],
}: InstructorDashboardViewProps) {
  const [toolsOpen, setToolsOpen] = React.useState(false);

  const teachNow = firstLectures.filter((lecture) => lecture.liveClassId && !lecture.windowEnded);
  const markComplete = firstLectures.filter(
    (lecture) => lecture.liveClassId && lecture.windowEnded,
  );
  const waitingLink = firstLectures.filter((lecture) => !lecture.liveClassId);

  const actionNeeded = teachNow.length + markComplete.length;
  const nextStep =
    teachNow.length > 0
      ? {
          href: "#queue-teach",
          label: "Join a lecture",
          detail: "Open the Teach now queue, then Join Zoom for the student on the timetable.",
        }
      : markComplete.length > 0
        ? {
            href: "#queue-complete",
            label: "Mark subject complete",
            detail:
              "Close finished lectures so the subject does not reopen. TKI 1 books the next one.",
          }
        : {
            href: "#queue-upcoming",
            label: "Review assigned lectures",
            detail: "No urgent join/complete items. Check your upcoming cards and timetable.",
          };

  const attentionItems = [
    { id: "queue-teach", label: "Join Zoom", count: teachNow.length },
    { id: "queue-complete", label: "Mark complete", count: markComplete.length },
    { id: "queue-upcoming", label: "Assigned lectures", count: firstLectures.length },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instructor dashboard"
        description={`Next: ${nextStep.label}. ${nextStep.detail}`}
        breadcrumbs={[{ label: "Instructor" }, { label: "Dashboard" }]}
        actions={
          <Button asChild>
            <a href={nextStep.href}>{nextStep.label}</a>
          </Button>
        }
      />

      <div
        className={cn(
          "rounded-2xl border p-4 sm:p-5",
          actionNeeded > 0
            ? "border-accent/35 bg-accent/10"
            : "border-emerald-500/25 bg-emerald-500/10",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {actionNeeded > 0 ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            ) : (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                aria-hidden
              />
            )}
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {actionNeeded > 0
                  ? actionNeeded === 1
                    ? "1 item needs instructor action"
                    : `${actionNeeded} items need instructor action`
                  : "No urgent teach / complete items right now"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your job: teach the assigned lecture, then mark the subject complete. TKI 1 opens
                the next subject after you agree a time.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {attentionItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                item.count > 0
                  ? "border-accent/40 bg-background text-foreground hover:bg-accent/10"
                  : "border-border/70 bg-background/60 text-muted-foreground",
              )}
            >
              {item.label}
              <span className="tabular-nums">{item.count}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today's classes" value={overview.todaysClasses} icon={Video} />
        <StatCard label="Upcoming classes" value={overview.upcomingClasses} icon={CalendarPlus} />
        <StatCard label="Students" value={overview.students} icon={Users} />
      </div>

      <div className="space-y-4">
        <QueueSection
          id="queue-teach"
          step={1}
          title="Teach now"
          hint="Join Zoom for lectures that still have an open window. One card = one student lecture."
          count={teachNow.length}
          tone={teachNow.length ? "action" : "ok"}
        >
          {teachNow.length === 0 ? (
            <EmptyQueue message="No open lectures to join right now." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {teachNow.map((lecture) => (
                <LectureTaskCard key={lecture.id} lecture={lecture} />
              ))}
            </ul>
          )}
        </QueueSection>

        <QueueSection
          id="queue-complete"
          step={2}
          title="Mark subject complete"
          hint="After the lecture time ends, close the subject here. It must not open again for the same student."
          count={markComplete.length}
          tone={markComplete.length ? "action" : "ok"}
        >
          {markComplete.length === 0 ? (
            <EmptyQueue message="No finished lectures waiting to be marked complete." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {markComplete.map((lecture) => (
                <LectureTaskCard key={lecture.id} lecture={lecture} />
              ))}
            </ul>
          )}
        </QueueSection>

        <QueueSection
          id="queue-upcoming"
          step={3}
          title="Assigned lectures"
          hint="All ATPL first lectures assigned to you by TKI 1, including ones still waiting for a live class link."
          count={firstLectures.length}
          tone="neutral"
        >
          {firstLectures.length === 0 ? (
            <EmptyQueue message="No ATPL first lectures assigned to you yet." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {firstLectures.map((lecture) => (
                <LectureTaskCard key={lecture.id} lecture={lecture} />
              ))}
            </ul>
          )}
          {waitingLink.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {waitingLink.length} card{waitingLink.length === 1 ? "" : "s"} still waiting for a
              live class link.
            </p>
          ) : null}
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/instructor/schedule">Open timetable</Link>
            </Button>
          </div>
        </QueueSection>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/60">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
          onClick={() => setToolsOpen((value) => !value)}
          aria-expanded={toolsOpen}
        >
          <div>
            <p className="font-display text-base font-semibold tracking-tight">Secondary tools</p>
            <p className="text-sm text-muted-foreground">
              Attendance chart, calendar, live classes list, and students.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              toolsOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {toolsOpen ? (
          <div className="space-y-4 border-t border-border/70 px-4 py-4 sm:px-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Attendance">
                <BarsChart data={attendance} />
              </ChartCard>
              <CalendarWidget events={calendar} title="My schedule" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/instructor/classes">
                  <Video className="mr-2 h-4 w-4" aria-hidden />
                  Live classes
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/instructor/schedule">
                  <CalendarPlus className="mr-2 h-4 w-4" aria-hidden />
                  Open timetable
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/instructor/students">
                  <Users className="mr-2 h-4 w-4" aria-hidden />
                  Students
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export { InstructorDashboardView };
