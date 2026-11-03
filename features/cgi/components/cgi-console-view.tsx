"use client";

import * as React from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Users,
} from "lucide-react";

import { format, parse } from "date-fns";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard";
import { ACTION_LABELS } from "@/constants/programme-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function parseIsoDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

type Snapshot = {
  subjectCount: number;
  studentCount: number;
  instructorCount: number;
  lectureAssignmentCount: number;
  defaultFirstSubjectCourseId: string | null;
  subjects: Array<{ id: string; code: string; title: string; primaryInstructorId: string | null }>;
  students: Array<{
    studentId: string;
    name: string;
    email: string;
    firstSubjectCourseId?: string | null;
    firstSubjectCode: string | null;
    firstSubjectTitle?: string | null;
    enrollmentCount: number;
    requestedFirstLectureLabel: string | null;
    confirmedFirstLectureLabel: string | null;
    scheduleProvisional: boolean;
    firstLectureOnTimetable?: boolean;
    firstLectureSubjectTitle?: string | null;
    instructorAssignmentStatus?: "pending" | "assigned";
    instructorAssignmentLabel?: string | null;
  }>;
  pendingInstructorAssignments: Array<{
    studentId: string;
    name: string;
    email: string;
    instructorAssignmentLabel?: string | null;
  }>;
  pendingFirstLectures: Array<{
    studentId: string;
    name: string;
    email: string;
    requestedFirstLectureLabel: string | null;
    requestedStudyStartDate: string | null;
    requestedFirstLectureTime: string | null;
    scheduleProvisional: boolean;
  }>;
  confirmedFirstLectures: Array<{
    studentId: string;
    name: string;
    email: string;
    confirmedFirstLectureLabel: string | null;
    firstLectureOnTimetable?: boolean;
    firstLectureSubjectTitle?: string | null;
  }>;
  readyForNextSubject: Array<{
    studentId: string;
    name: string;
    email: string;
    nextSubjectTitle: string | null;
    confirmedFirstLectureLabel: string | null;
  }>;
  readyToCompleteSubject: Array<{
    studentId: string;
    name: string;
    email: string;
    nextSubjectTitle: string | null;
    nextLectureLabel: string | null;
  }>;
  schedulingRequired: Array<{
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    subject: string;
    instructorName: string;
    reason: string | null;
  }>;
  instructors: Array<{
    instructorId: string;
    name: string;
    email: string;
    atplSubjectCount: number;
    upcomingClasses: number;
  }>;
  recentAudit: Array<{ id: string; action: string; detail: string; createdAt: string }>;
};

function liveJourneyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return !email.trim().toLowerCase().endsWith(".test");
}

async function cgiFetch<T>(query = ""): Promise<T> {
  const res = await fetch(`/api/cgi${query}`, { cache: "no-store" });
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

async function cgiPost(body: Record<string, unknown>) {
  const res = await fetch("/api/cgi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; data: unknown; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

function QueueSection({
  id,
  step,
  title,
  hint,
  count,
  tone = "neutral",
  compact = false,
  children,
}: {
  id: string;
  step: number;
  title: string;
  hint: string;
  count: number;
  tone?: "neutral" | "action" | "ok";
  compact?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!compact || count > 0);

  React.useEffect(() => {
    if (count > 0) setOpen(true);
  }, [count]);

  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-border/80 bg-card/80 p-4 sm:p-5"
    >
      <button
        type="button"
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                tone === "action" && "bg-accent/15 text-accent",
                tone === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                tone === "neutral" && "bg-primary/10 text-primary",
              )}
            >
              {step}
            </span>
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
          {open ? <p className="max-w-3xl text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 tabular-nums",
            count > 0 && tone === "action" && "border-accent/40 bg-accent/10 text-accent",
          )}
        >
          {count}
        </Badge>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600/80" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

function AssignInstructorCard({
  student,
  courseId,
  instructors,
  busy,
  onAssign,
}: {
  student: Snapshot["pendingInstructorAssignments"][number];
  courseId: string;
  instructors: Snapshot["instructors"];
  busy: boolean;
  onAssign: (instructorId: string) => void;
}) {
  const [instructorId, setInstructorId] = React.useState(instructors[0]?.instructorId ?? "");

  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{student.name}</p>
          <p className="text-sm text-muted-foreground">{student.email}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-accent">
            {student.instructorAssignmentLabel || "Pending Instructor Assignment"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <div className="min-w-[11rem] flex-1 space-y-1 sm:flex-none">
            <Label className="text-xs" htmlFor={`assign-instructor-${student.studentId}`}>
              Instructor
            </Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger id={`assign-instructor-${student.studentId}`} className="h-9">
                <SelectValue placeholder="Select instructor" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.instructorId} value={i.instructorId}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={busy || !instructorId || !courseId}
            onClick={() => onAssign(instructorId)}
          >
            Assign instructor
          </Button>
        </div>
      </div>
    </li>
  );
}

function ProvisionalFirstLectureCard({
  student,
  busy,
  onConfirmRequested,
  onConfirmDifferent,
}: {
  student: Snapshot["pendingFirstLectures"][number];
  busy: boolean;
  onConfirmRequested: () => void;
  onConfirmDifferent: (date: string, time: string) => void;
}) {
  const [date, setDate] = React.useState(student.requestedStudyStartDate ?? "");
  const [time, setTime] = React.useState(student.requestedFirstLectureTime ?? "");

  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="font-medium">{student.name}</p>
      <p className="text-sm text-muted-foreground">{student.email}</p>
      <p className="mt-1 text-sm">
        Requested: <span className="font-medium">{student.requestedFirstLectureLabel ?? "—"}</span>
        <span className="ml-2 text-xs uppercase tracking-wide text-accent">Provisional</span>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Button size="sm" disabled={busy} onClick={onConfirmRequested}>
          {ACTION_LABELS.confirmRequestedFirstLecture}
        </Button>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`confirm-date-${student.studentId}`}>
            Different date
          </Label>
          <DatePicker
            date={parseIsoDate(date)}
            onSelect={(next) => setDate(toIsoDate(next))}
            placeholder="dd/mm/yyyy"
            className="h-9 w-[11rem]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`confirm-time-${student.studentId}`}>
            Different time
          </Label>
          <Input
            id={`confirm-time-${student.studentId}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-[8rem]"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onConfirmDifferent(date, time)}
        >
          {ACTION_LABELS.confirmDifferentFirstLecture}
        </Button>
      </div>
    </li>
  );
}

function NextSubjectCard({
  student,
  busy,
  onOpen,
}: {
  student: Snapshot["readyForNextSubject"][number];
  busy: boolean;
  onOpen: (date: string, time: string) => void;
}) {
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");

  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="font-medium">{student.name}</p>
      <p className="text-sm text-muted-foreground">{student.email}</p>
      <p className="mt-1 text-sm">
        Next: <span className="font-medium">{student.nextSubjectTitle ?? "—"}</span>
        <span className="ml-2 text-xs uppercase tracking-wide text-accent">Waiting</span>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`next-date-${student.studentId}`}>
            Lecture date
          </Label>
          <DatePicker
            date={parseIsoDate(date)}
            onSelect={(next) => setDate(toIsoDate(next))}
            placeholder="dd/mm/yyyy"
            className="h-9 w-[11rem]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`next-time-${student.studentId}`}>
            Time
          </Label>
          <Input
            id={`next-time-${student.studentId}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-[8rem]"
          />
        </div>
        <Button size="sm" disabled={busy || !date || !time} onClick={() => onOpen(date, time)}>
          {ACTION_LABELS.openNextSubject}
        </Button>
      </div>
    </li>
  );
}

function CompleteSubjectCard({
  student,
  busy,
  onComplete,
}: {
  student: Snapshot["readyToCompleteSubject"][number];
  busy: boolean;
  onComplete: () => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{student.name}</p>
          <p className="text-sm text-muted-foreground">{student.email}</p>
          <p className="mt-1 text-sm">
            Current: <span className="font-medium">{student.nextSubjectTitle ?? "—"}</span>
            {student.nextLectureLabel ? ` · ${student.nextLectureLabel}` : ""}
            <span className="ml-2 text-xs uppercase tracking-wide text-accent">Open</span>
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={onComplete}>
          {ACTION_LABELS.completeCurrentSubject}
        </Button>
      </div>
    </li>
  );
}

function ToolsPanel({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-base font-semibold tracking-tight">Management tools</h2>
          <p className="text-sm text-muted-foreground">
            Defaults, subject distribution, lecture assignment, notes, and directories
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-8 border-t border-border/70 px-4 py-5 sm:px-5">{children}</div>
      ) : null}
    </section>
  );
}

export function CgiConsoleView({ initial }: { initial: Snapshot }) {
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);

  const [firstSubjectCourseId, setFirstSubjectCourseId] = React.useState(
    initial.defaultFirstSubjectCourseId ?? initial.subjects[0]?.id ?? "",
  );
  const [studentId, setStudentId] = React.useState(initial.students[0]?.studentId ?? "");
  const [studentFirstSubject, setStudentFirstSubject] = React.useState(
    initial.subjects[0]?.id ?? "",
  );
  const [changeCourseId, setChangeCourseId] = React.useState(initial.subjects[0]?.id ?? "");
  const [changeInstructorId, setChangeInstructorId] = React.useState(
    initial.instructors.find((row) => liveJourneyEmail(row.email))?.instructorId ?? "",
  );
  const [lectureTitle, setLectureTitle] = React.useState("ATPL briefing");
  const [lectureCourseId, setLectureCourseId] = React.useState(initial.subjects[0]?.id ?? "");
  const [lectureInstructorId, setLectureInstructorId] = React.useState(
    initial.instructors.find((row) => liveJourneyEmail(row.email))?.instructorId ?? "",
  );
  const [noteTarget, setNoteTarget] = React.useState(initial.students[0]?.studentId ?? "");
  const [noteBody, setNoteBody] = React.useState("");

  React.useEffect(() => {
    const student = data.students.find((row) => row.studentId === studentId);
    const selected =
      student?.firstSubjectCourseId ||
      data.subjects.find((subject) => subject.code === student?.firstSubjectCode)?.id ||
      "";
    if (selected) {
      setStudentFirstSubject(selected);
      setLectureCourseId(selected);
    }
  }, [studentId, data.students, data.subjects]);

  const pendingInstructorAssignments = (data.pendingInstructorAssignments ?? []).filter((row) =>
    liveJourneyEmail(row.email),
  );
  const pendingFirstLectures = data.pendingFirstLectures.filter((row) =>
    liveJourneyEmail(row.email),
  );
  const confirmedFirstLectures = data.confirmedFirstLectures.filter((row) =>
    liveJourneyEmail(row.email),
  );
  const schedulingRequired = (data.schedulingRequired ?? []).filter((row) =>
    liveJourneyEmail(row.studentEmail),
  );
  const readyForNextSubject = data.readyForNextSubject.filter((row) => liveJourneyEmail(row.email));
  const readyToCompleteSubject = data.readyToCompleteSubject.filter((row) =>
    liveJourneyEmail(row.email),
  );
  const instructors = data.instructors.filter((row) => liveJourneyEmail(row.email));

  const actionNeeded =
    pendingInstructorAssignments.length +
    pendingFirstLectures.length +
    schedulingRequired.length +
    readyForNextSubject.length +
    readyToCompleteSubject.length;

  const instrumentationSubject =
    data.subjects.find(
      (s) => /instrumentation/i.test(s.title) || /instrumentation/i.test(s.code),
    ) ?? data.subjects[0];

  function courseIdForStudent(studentIdValue: string): string {
    const student = data.students.find((row) => row.studentId === studentIdValue);
    return (
      student?.firstSubjectCourseId ||
      data.subjects.find((subject) => subject.code === student?.firstSubjectCode)?.id ||
      data.defaultFirstSubjectCourseId ||
      instrumentationSubject?.id ||
      ""
    );
  }

  async function refresh() {
    const next = await cgiFetch<Snapshot>("?view=dashboard");
    setData(next);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const attentionItems = [
    {
      id: "queue-assign",
      label: "Assign instructor",
      count: pendingInstructorAssignments.length,
    },
    {
      id: "queue-provisional",
      label: "Confirm first lecture",
      count: pendingFirstLectures.length,
    },
    {
      id: "queue-scheduling",
      label: "Reschedule / reassign",
      count: schedulingRequired.length,
    },
    {
      id: "queue-next",
      label: "Open next subject",
      count: readyForNextSubject.length,
    },
    {
      id: "queue-complete",
      label: "Complete subject",
      count: readyToCompleteSubject.length,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CGI Dashboard"
        description="ATPL journey control for management — assign instructors, confirm first lectures, then open the next subject. The ATPL Complete Package always opens with Instrumentation."
        breadcrumbs={[{ label: "CGI" }, { label: "Dashboard" }]}
      />

      <div
        className={cn(
          "rounded-2xl border px-4 py-3 sm:px-5",
          actionNeeded > 0
            ? "border-accent/35 bg-accent/10"
            : "border-emerald-500/25 bg-emerald-500/10",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {actionNeeded > 0 ? (
            <AlertCircle className="h-4 w-4 text-accent" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
          )}
          <p className="text-sm font-medium">
            {actionNeeded > 0
              ? actionNeeded === 1
                ? "1 item needs CGI action"
                : `${actionNeeded} items need CGI action`
              : "No urgent ATPL queue items right now"}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ATPL subjects" value={data.subjectCount} icon={BookOpen} />
        <StatCard label="ATPL students" value={data.studentCount} icon={Users} />
        <StatCard label="Instructors" value={data.instructorCount} icon={GraduationCap} />
        <StatCard
          label="Lecture assignments"
          value={data.lectureAssignmentCount}
          icon={CalendarClock}
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <QueueSection
          id="queue-assign"
          step={1}
          title="Pending Instructor Assignment"
          hint="Paid students waiting for TKI 1 to assign a theoretical-knowledge instructor."
          count={pendingInstructorAssignments.length}
          tone={pendingInstructorAssignments.length ? "action" : "ok"}
          compact={pendingInstructorAssignments.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {pendingInstructorAssignments.length === 0 ? (
              <EmptyQueue message="No students are waiting for an instructor." />
            ) : (
              pendingInstructorAssignments.map((s) => (
                <AssignInstructorCard
                  key={s.studentId}
                  student={s}
                  courseId={courseIdForStudent(s.studentId)}
                  instructors={instructors}
                  busy={busy}
                  onAssign={(instructorId) =>
                    void run(() =>
                      cgiPost({
                        action: "change_instructor",
                        courseId: courseIdForStudent(s.studentId),
                        instructorId,
                        studentId: s.studentId,
                      }),
                    )
                  }
                />
              ))
            )}
          </ul>
        </QueueSection>

        <QueueSection
          id="queue-provisional"
          step={2}
          title="Provisional first lectures (TKI 1)"
          hint="Students requested these start dates at checkout. Confirm the requested time, or set a different final time. Confirmation books the first lecture on the student’s timetable and notifies them."
          count={pendingFirstLectures.length}
          tone={pendingFirstLectures.length ? "action" : "ok"}
          compact={pendingFirstLectures.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {pendingFirstLectures.length === 0 ? (
              <EmptyQueue message="No requested first-lecture times yet." />
            ) : (
              pendingFirstLectures.map((s) => (
                <ProvisionalFirstLectureCard
                  key={s.studentId}
                  student={s}
                  busy={busy}
                  onConfirmRequested={() =>
                    void run(() =>
                      cgiPost({
                        action: "confirm_first_lecture",
                        studentId: s.studentId,
                      }),
                    )
                  }
                  onConfirmDifferent={(studyStartDate, firstLectureTime) =>
                    void run(() =>
                      cgiPost({
                        action: "confirm_first_lecture",
                        studentId: s.studentId,
                        studyStartDate,
                        firstLectureTime,
                      }),
                    )
                  }
                />
              ))
            )}
          </ul>
        </QueueSection>

        <QueueSection
          id="queue-confirmed"
          step={3}
          title="Confirmed first lectures"
          hint="TKI 1 has confirmed these times. They are booked on the student timetable."
          count={confirmedFirstLectures.length}
          tone="ok"
          compact={confirmedFirstLectures.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {confirmedFirstLectures.length === 0 ? (
              <EmptyQueue message="No confirmed first lectures yet." />
            ) : (
              confirmedFirstLectures.map((s) => (
                <li
                  key={s.studentId}
                  className="rounded-xl border border-border bg-background px-4 py-3"
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-muted-foreground">{s.email}</p>
                  <p className="mt-1">
                    {s.confirmedFirstLectureLabel}
                    {s.firstLectureSubjectTitle ? ` · ${s.firstLectureSubjectTitle}` : ""}
                    <span className="ml-2 text-xs uppercase tracking-wide text-accent">
                      {s.firstLectureOnTimetable ? "On timetable" : "Confirmed"}
                    </span>
                  </p>
                </li>
              ))
            )}
          </ul>
        </QueueSection>

        <QueueSection
          id="queue-scheduling"
          step={4}
          title="Scheduling Required"
          hint="The instructor could not agree the next lecture time. Assign another instructor below. Super Admin sees the same queue."
          count={schedulingRequired.length}
          tone={schedulingRequired.length ? "action" : "ok"}
          compact={schedulingRequired.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {schedulingRequired.length === 0 ? (
              <EmptyQueue message="No student is waiting for a new instructor." />
            ) : (
              schedulingRequired.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-border bg-background px-4 py-3"
                >
                  <p className="font-medium">{row.studentName}</p>
                  <p className="text-muted-foreground">{row.studentEmail}</p>
                  <p className="mt-1">
                    {row.subject} · {row.instructorName}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Use Management tools → Change instructor to reassign.
                  </p>
                </li>
              ))
            )}
          </ul>
        </QueueSection>

        <QueueSection
          id="queue-next"
          step={5}
          title="Open next official subject"
          hint="After Instrumentation is confirmed, TKI 1 books the next official subject. Booking that lecture marks the previous subject complete."
          count={readyForNextSubject.length}
          tone={readyForNextSubject.length ? "action" : "ok"}
          compact={readyForNextSubject.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {readyForNextSubject.length === 0 ? (
              <EmptyQueue message="No student is waiting for the next subject." />
            ) : (
              readyForNextSubject.map((s) => (
                <NextSubjectCard
                  key={s.studentId}
                  student={s}
                  busy={busy}
                  onOpen={(studyStartDate, lectureTime) =>
                    void run(() =>
                      cgiPost({
                        action: "open_next_subject",
                        studentId: s.studentId,
                        studyStartDate,
                        lectureTime,
                      }),
                    )
                  }
                />
              ))
            )}
          </ul>
        </QueueSection>

        <QueueSection
          id="queue-complete"
          step={6}
          title="Complete current subject"
          hint="Booking the next lecture already marks the previous subject complete. The assigned instructor can also mark the open subject complete from the class page, and that subject does not open again. Use this only when a subject should be complete before its next lecture is booked."
          count={readyToCompleteSubject.length}
          tone={readyToCompleteSubject.length ? "action" : "neutral"}
          compact={readyToCompleteSubject.length === 0}
        >
          <ul className="space-y-2 text-sm">
            {readyToCompleteSubject.length === 0 ? (
              <EmptyQueue message="No open subject is waiting to be completed." />
            ) : (
              readyToCompleteSubject.map((s) => (
                <CompleteSubjectCard
                  key={s.studentId}
                  student={s}
                  busy={busy}
                  onComplete={() =>
                    void run(() =>
                      cgiPost({
                        action: "complete_subject",
                        studentId: s.studentId,
                      }),
                    )
                  }
                />
              ))
            )}
          </ul>
        </QueueSection>
      </div>

      <ToolsPanel open={toolsOpen} onToggle={() => setToolsOpen((value) => !value)}>
        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Choose first subject (platform default)</h3>
          <p className="text-sm text-muted-foreground">
            The ATPL Complete Package always opens with Instrumentation. Saving a different default
            only changes this dropdown for manual subject distribution.
          </p>
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>First subject</Label>
              <Select value={firstSubjectCourseId} onValueChange={setFirstSubjectCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {data.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !firstSubjectCourseId}
              onClick={() =>
                void run(() =>
                  cgiPost({ action: "set_default_first_subject", courseId: firstSubjectCourseId }),
                )
              }
            >
              Save default
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Distribute subjects & first subject</h3>
          <p className="text-sm text-muted-foreground">
            Assign the ATPL subject order for a student and unlock the opening subject.
          </p>
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {data.students.map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>First subject</Label>
              <Select value={studentFirstSubject} onValueChange={setStudentFirstSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {data.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !studentId}
              variant="secondary"
              onClick={() =>
                void run(() =>
                  cgiPost({
                    action: "distribute_subjects",
                    studentId,
                    courseIds: data.subjects.map((s) => s.id),
                    firstCourseId: studentFirstSubject || data.subjects[0]?.id,
                  }),
                )
              }
            >
              Distribute all subjects
            </Button>
            <Button
              disabled={busy || !studentId || !studentFirstSubject}
              onClick={() =>
                void run(() =>
                  cgiPost({
                    action: "choose_first_subject",
                    studentId,
                    courseId: studentFirstSubject,
                  }),
                )
              }
            >
              Set first subject
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Change instructor</h3>
          <p className="text-sm text-muted-foreground">
            The next lecture is agreed from the instructor&apos;s availability. If that instructor
            is not available, assign another instructor for this student. Future lectures move to
            the new instructor.
          </p>
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Student" />
                </SelectTrigger>
                <SelectContent>
                  {data.students.map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Subject</Label>
              <Select value={changeCourseId} onValueChange={setChangeCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {data.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Instructor</Label>
              <Select value={changeInstructorId} onValueChange={setChangeInstructorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Instructor" />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.instructorId} value={i.instructorId}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !changeCourseId || !changeInstructorId}
              onClick={() =>
                void run(() =>
                  cgiPost({
                    action: "change_instructor",
                    courseId: changeCourseId,
                    instructorId: changeInstructorId,
                    studentId: studentId || undefined,
                  }),
                )
              }
            >
              Reassign instructor
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Distribute lecture</h3>
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Title</Label>
              <Input value={lectureTitle} onChange={(e) => setLectureTitle(e.target.value)} />
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Subject</Label>
              <Select value={lectureCourseId} onValueChange={setLectureCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {data.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Instructor</Label>
              <Select value={lectureInstructorId} onValueChange={setLectureInstructorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Instructor" />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.instructorId} value={i.instructorId}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !lectureCourseId || !lectureInstructorId}
              onClick={() =>
                void run(() =>
                  cgiPost({
                    action: "distribute_lecture",
                    courseId: lectureCourseId,
                    lessonId: `lesson-${Date.now()}`,
                    lessonTitle: lectureTitle,
                    instructorId: lectureInstructorId,
                    studentId: studentId || null,
                  }),
                )
              }
            >
              Assign lecture
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold tracking-tight">ATPL students</h3>
            <ul className="space-y-2 text-sm">
              {data.students.length === 0 ? (
                <li className="text-muted-foreground">No ATPL package enrollments yet.</li>
              ) : (
                data.students.map((s) => (
                  <li key={s.studentId} className="border-b border-border/60 pb-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground"> · {s.email}</span>
                    <div className="text-muted-foreground">
                      First: {s.firstSubjectTitle ?? s.firstSubjectCode ?? "—"} ·{" "}
                      {s.enrollmentCount} enrollments
                      {s.scheduleProvisional && s.requestedFirstLectureLabel
                        ? ` · requested ${s.requestedFirstLectureLabel}`
                        : s.confirmedFirstLectureLabel
                          ? ` · confirmed ${s.confirmedFirstLectureLabel}`
                          : ""}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold tracking-tight">Instructors</h3>
            <ul className="space-y-2 text-sm">
              {instructors.map((i) => (
                <li key={i.instructorId} className="border-b border-border/60 pb-2">
                  <span className="font-medium">{i.name}</span>
                  <div className="text-muted-foreground">
                    {i.atplSubjectCount} ATPL subjects · {i.upcomingClasses} upcoming classes
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Follow-up note</h3>
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Student</Label>
              <Select value={noteTarget} onValueChange={setNoteTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Student" />
                </SelectTrigger>
                <SelectContent>
                  {data.students.map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Note</Label>
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} />
            </div>
            <Button
              disabled={busy || !noteTarget || !noteBody.trim()}
              onClick={() =>
                void run(async () => {
                  await cgiPost({
                    action: "add_note",
                    targetType: "student",
                    targetUserId: noteTarget,
                    body: noteBody,
                  });
                  setNoteBody("");
                })
              }
            >
              Save note
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold tracking-tight">Recent CGI activity</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {data.recentAudit.length === 0 ? (
              <li>No activity yet.</li>
            ) : (
              data.recentAudit.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-foreground">{a.action}</span> — {a.detail}
                </li>
              ))
            )}
          </ul>
        </div>
      </ToolsPanel>
    </div>
  );
}
