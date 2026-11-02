"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  cleanEventTitle,
  eventDayKey,
  eventTypeLabel,
  formatEventWhen,
  humanConflictLines,
  kindLabel,
  requestPriority,
} from "@/features/assignment/lib/request-display";
import { cn } from "@/lib/utils";

type Snapshot = {
  counts: {
    instructors: number;
    requests: number;
    schedulingRequired: number;
    queued: number;
    scheduled: number;
    unable: number;
    waitingQueue: number;
  };
  instructors: Array<{
    id: string;
    name: string;
    email: string;
    windows: number;
    openRequests: number;
  }>;
  atplCourses: Array<{
    id: string;
    code: string;
    title: string;
    primaryInstructorId: string | null;
  }>;
  recentRequests: Array<{
    id: string;
    kind: string;
    courseId: string;
    lessonTitle: string;
    status: string;
    instructorId: string;
    courseCode?: string | null;
    courseTitle?: string | null;
    instructorName?: string | null;
    studentName?: string | null;
    preferredStartsAt?: string | null;
    conflictSummary: string | null;
    unableReason: string | null;
    liveClassId: string | null;
    zoomMeetingId: string | null;
    queuePosition: number | null;
  }>;
  queue: Array<{
    id: string;
    assignmentRequestId: string;
    instructorId: string;
    status: string;
    preferredStartsAt: string | null;
  }>;
};

type RequestFilter = "needs_action" | "queued" | "all";

type RecentRequest = Snapshot["recentRequests"][number];

type CalendarPayload = {
  instructorName: string;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    type: string;
    status: string;
  }>;
  availability: Array<{ weekday: number; startTime: string; endTime: string }>;
  queue: Array<{ id: string; status: string }>;
};

async function assignFetch<T>(query = ""): Promise<T> {
  const res = await fetch(`/api/assignment${query}`, { cache: "no-store" });
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

async function assignPost(body: Record<string, unknown>) {
  const res = await fetch("/api/assignment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; data: unknown; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function statusTone(status: string): "action" | "ok" | "warn" | "neutral" {
  const value = status.toLowerCase();
  if (value.includes("unable") || value.includes("conflict") || value.includes("fail")) {
    return "warn";
  }
  if (value.includes("schedul") || value.includes("queued") || value.includes("waiting")) {
    return "action";
  }
  if (value.includes("done") || value.includes("complete") || value.includes("assigned")) {
    return "ok";
  }
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        tone === "action" && "border-accent/50 bg-accent/15 font-medium text-foreground",
        tone === "ok" &&
          "border-emerald-600/40 bg-emerald-500/15 font-medium text-emerald-900 dark:text-emerald-200",
        tone === "warn" && "border-destructive/40 bg-destructive/15 font-medium text-destructive",
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function needsAttention(request: RecentRequest): boolean {
  const status = request.status.toLowerCase();
  return (
    Boolean(request.conflictSummary) ||
    Boolean(request.unableReason) ||
    status.includes("scheduling_required") ||
    status.includes("unable")
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600/80" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

function RecentRequestsBoard({
  requests,
  busy,
  onFix,
  onRetrySchedule,
  onProcessQueue,
}: {
  requests: RecentRequest[];
  busy: boolean;
  onFix: (request: RecentRequest) => void;
  onRetrySchedule: (request: RecentRequest) => void;
  onProcessQueue: () => void;
}) {
  const [filter, setFilter] = React.useState<RequestFilter>("needs_action");
  const [showAll, setShowAll] = React.useState(false);

  const sorted = React.useMemo(() => {
    return [...requests].sort((a, b) => {
      const diff =
        requestPriority(a.status, Boolean(a.conflictSummary || a.unableReason)) -
        requestPriority(b.status, Boolean(b.conflictSummary || b.unableReason));
      if (diff !== 0) return diff;
      return (b.queuePosition ?? 0) - (a.queuePosition ?? 0);
    });
  }, [requests]);

  const filtered = sorted.filter((request) => {
    if (filter === "all") return true;
    if (filter === "queued") return request.status.toLowerCase().includes("queued");
    return needsAttention(request);
  });

  const visible = showAll ? filtered : filtered.slice(0, 8);
  const needsCount = sorted.filter(needsAttention).length;
  const queuedCount = sorted.filter((request) =>
    request.status.toLowerCase().includes("queued"),
  ).length;

  if (requests.length === 0) {
    return <EmptyState message="No requests yet." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "needs_action", label: "Needs action", count: needsCount },
            { id: "queued", label: "Queued", count: queuedCount },
            { id: "all", label: "All", count: sorted.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id);
              setShowAll(false);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === item.id
                ? "border-accent/40 bg-accent/10 text-foreground"
                : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40",
            )}
          >
            {item.label}
            <span className="tabular-nums">{item.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          message={
            filter === "needs_action"
              ? "No conflicts or blocked requests right now."
              : filter === "queued"
                ? "No queued requests."
                : "No requests yet."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((request) => {
            const conflicts = humanConflictLines(request.conflictSummary);
            const title =
              request.courseCode && request.courseTitle
                ? `${request.courseCode} · ${request.courseTitle}`
                : request.lessonTitle;
            const attention = needsAttention(request);

            return (
              <li
                key={request.id}
                className={cn(
                  "rounded-xl border bg-background px-4 py-3",
                  attention ? "border-accent/35" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{title}</p>
                      <Badge variant="secondary" className="capitalize">
                        {kindLabel(request.kind)}
                      </Badge>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-sm text-foreground/80">
                      {request.instructorName || "Instructor"}
                      {request.studentName ? ` · Student ${request.studentName}` : ""}
                      {request.queuePosition ? ` · Queue #${request.queuePosition}` : ""}
                      {request.preferredStartsAt
                        ? ` · Preferred ${new Date(request.preferredStartsAt).toLocaleString()}`
                        : ""}
                      {request.zoomMeetingId
                        ? ` · Zoom ${request.zoomMeetingId.slice(0, 10)}…`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onFix(request)}
                    >
                      Fix in assign
                    </Button>
                    {request.status.toLowerCase().includes("queued") ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={onProcessQueue}>
                        Process queue
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onRetrySchedule(request)}
                      >
                        Retry schedule
                      </Button>
                    )}
                  </div>
                </div>

                {conflicts.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-amber-700/35 bg-amber-50 px-3 py-2.5 dark:border-amber-300/40 dark:bg-amber-950/55">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      Why it is blocked
                    </p>
                    <ul className="space-y-1.5 text-sm leading-snug text-foreground">
                      {conflicts.map((line) => (
                        <li key={line} className="flex gap-2">
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300"
                            aria-hidden
                          />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {request.unableReason ? (
                  <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Unable: {request.unableReason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > 8 ? (
        <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all ${filtered.length}`}
        </Button>
      ) : null}
    </div>
  );
}

function Panel({
  id,
  step,
  title,
  hint,
  count,
  tone = "neutral",
  defaultOpen = true,
  actions,
  children,
}: {
  id: string;
  step?: number;
  title: string;
  hint: string;
  count?: number;
  tone?: "neutral" | "action" | "ok" | "warn";
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-border/80 bg-card/80 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            {typeof step === "number" ? (
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  tone === "action" && "bg-accent/15 text-accent",
                  tone === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  tone === "warn" && "bg-destructive/15 text-destructive",
                  tone === "neutral" && "bg-primary/10 text-primary",
                )}
              >
                {step}
              </span>
            ) : null}
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
          {open ? <p className="mt-1 max-w-3xl text-sm text-foreground/75">{hint}</p> : null}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {typeof count === "number" ? (
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                count > 0 && tone === "action" && "border-accent/40 bg-accent/10 text-accent",
                count > 0 &&
                  tone === "warn" &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {count}
            </Badge>
          ) : null}
          {actions}
        </div>
      </div>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

type CalendarFilter = "active" | "cancelled" | "all";

function InstructorCalendarBoard({ calendar }: { calendar: CalendarPayload }) {
  const [filter, setFilter] = React.useState<CalendarFilter>("active");

  const sortedEvents = React.useMemo(() => {
    return [...calendar.events].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }, [calendar.events]);

  const filtered = sortedEvents.filter((event) => {
    const status = event.status.toLowerCase();
    if (filter === "all") return true;
    if (filter === "cancelled") return status.includes("cancel");
    return !status.includes("cancel");
  });

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const event of filtered) {
      const key = eventDayKey(event.startsAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const activeCount = sortedEvents.filter(
    (event) => !event.status.toLowerCase().includes("cancel"),
  ).length;
  const cancelledCount = sortedEvents.length - activeCount;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
        <div>
          <p className="font-medium">{calendar.instructorName}</p>
          <p className="text-sm text-muted-foreground">
            <CalendarClock className="mr-1 inline h-4 w-4" />
            {calendar.availability.length} weekly windows · {calendar.queue.length} queued ·{" "}
            {sortedEvents.length} events
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <h3 className="text-sm font-semibold">Weekly availability</h3>
        {calendar.availability.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No availability windows set.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {calendar.availability.map((window, idx) => (
              <Badge key={`${window.weekday}-${idx}`} variant="secondary" className="font-normal">
                {WEEKDAYS[window.weekday]} {window.startTime}–{window.endTime}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Sessions on calendar</h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "active", label: "Active", count: activeCount },
                { id: "cancelled", label: "Cancelled", count: cancelledCount },
                { id: "all", label: "All", count: sortedEvents.length },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === item.id
                    ? "border-accent/40 bg-accent/10 text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40",
                )}
              >
                {item.label}
                <span className="tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            message={
              filter === "cancelled"
                ? "No cancelled sessions for this instructor."
                : "No calendar sessions in range."
            }
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, events]) => (
              <div key={day} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {new Date(`${day}T12:00:00.000Z`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <ul className="space-y-2">
                  {events.map((event) => {
                    const cancelled = event.status.toLowerCase().includes("cancel");
                    return (
                      <li
                        key={event.id}
                        className={cn(
                          "rounded-xl border bg-background px-4 py-3",
                          cancelled ? "border-border/70 opacity-80" : "border-border",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium">{cleanEventTitle(event.title)}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatEventWhen(event.startsAt, event.endsAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{eventTypeLabel(event.type)}</Badge>
                            <StatusBadge status={event.status} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AssignmentEngineView({ initial }: { initial: Snapshot }) {
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [courseId, setCourseId] = React.useState(initial.atplCourses[0]?.id ?? "");
  const [instructorId, setInstructorId] = React.useState(initial.instructors[0]?.id ?? "");
  const [calendarInstructorId, setCalendarInstructorId] = React.useState(
    initial.instructors[0]?.id ?? "",
  );
  const [calendar, setCalendar] = React.useState<CalendarPayload | null>(null);
  const [preferredStartsAt, setPreferredStartsAt] = React.useState("");

  const instructorNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const instructor of data.instructors) map.set(instructor.id, instructor.name);
    return map;
  }, [data.instructors]);

  const actionNeeded =
    data.counts.schedulingRequired + data.counts.waitingQueue + data.counts.unable;

  const nextStep =
    data.counts.schedulingRequired > 0 || data.counts.unable > 0
      ? {
          href: "#recent-requests",
          label: "Fix blocked requests",
          detail: "Open Needs action, read the conflict, then Fix in assign or Retry schedule.",
        }
      : data.counts.waitingQueue > 0
        ? {
            href: "#waiting-queue",
            label: "Process waiting queue",
            detail: "Retry queued lectures until instructors have open slots.",
          }
        : {
            href: "#assign-action",
            label: "Assign an instructor",
            detail: "Pick subject + instructor, then Assign, Reassign, or Schedule + Zoom.",
          };

  async function refresh() {
    setData(await assignFetch<Snapshot>("?view=dashboard"));
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

  React.useEffect(() => {
    if (!calendarInstructorId) return;
    void assignFetch<CalendarPayload>(`?view=calendar&instructorId=${calendarInstructorId}`)
      .then(setCalendar)
      .catch((err: Error) => setError(err.message));
  }, [calendarInstructorId, data.counts.requests, data.counts.queued]);

  return (
    <div className="space-y-6">
      <div className="mb-8 space-y-4">
        <PageHeader
          className="mb-0"
          title="Instructor Assignment Engine"
          description={`Next: ${nextStep.label}. ${nextStep.detail}`}
          breadcrumbs={[{ label: "CGI" }, { label: "Assignment Engine" }]}
          actions={
            <Button asChild>
              <a href={nextStep.href}>{nextStep.label}</a>
            </Button>
          }
        />

        <div className="rounded-2xl border border-border/80 bg-card/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How to work this page
              </p>
              <p className="text-sm text-muted-foreground">
                Follow the four steps in order. The gold border marks your next action.
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                actionNeeded > 0
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              )}
            >
              {actionNeeded > 0 ? (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {actionNeeded > 0
                ? actionNeeded === 1
                  ? "1 item waiting"
                  : `${actionNeeded} items waiting`
                : "Queue clear"}
            </div>
          </div>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                step: 1,
                href: "#assign-action",
                title: "Assign instructor",
                body: "Choose subject + instructor, then Assign or Reassign.",
              },
              {
                step: 2,
                href: "#waiting-queue",
                title: "Clear waiting queue",
                body: "Process queue when slots free up.",
                count: data.counts.waitingQueue,
              },
              {
                step: 3,
                href: "#recent-requests",
                title: "Fix blocked requests",
                body: "Resolve conflicts and retry schedule.",
                count: data.counts.schedulingRequired + data.counts.unable,
              },
              {
                step: 4,
                href: "#instructor-calendar",
                title: "Check calendar",
                body: "Confirm availability before Schedule + Zoom.",
              },
            ].map((item) => (
              <li key={item.step}>
                <a
                  href={item.href}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-xl border bg-background px-3 py-3 transition-colors hover:border-accent/40 hover:bg-accent/5",
                    nextStep.href === item.href ? "border-accent/45" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {item.step}
                    </span>
                    {typeof item.count === "number" ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "tabular-nums",
                          item.count > 0 && "border-accent/40 bg-accent/10 text-accent",
                        )}
                      >
                        {item.count}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold tracking-tight">{item.title}</p>
                  <p className="text-xs text-foreground/70">{item.body}</p>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Scheduling required"
          value={data.counts.schedulingRequired}
          icon={Hourglass}
        />
        <StatCard label="Waiting queue" value={data.counts.waitingQueue} icon={Users} />
        <StatCard label="Scheduled" value={data.counts.scheduled} icon={CheckCircle2} />
        <StatCard label="Unable to schedule" value={data.counts.unable} icon={AlertTriangle} />
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <Panel
          id="assign-action"
          step={1}
          title="Assign / reassign instructor"
          hint="Pick the ATPL subject and instructor. Use Assign for a new booking, Reassign to move future classes, or Schedule + Zoom when you already have a preferred start time."
          tone="action"
        >
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="form-row-responsive">
              <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
                <Label>ATPL subject</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.atplCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
                <Label>Instructor</Label>
                <Select value={instructorId} onValueChange={setInstructorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.instructors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                        {i.openRequests > 0 ? ` · ${i.openRequests} open` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[220px]">
                <Label htmlFor="preferred-start">Preferred start (optional)</Label>
                <DateTimePicker
                  id="preferred-start"
                  value={preferredStartsAt}
                  onChange={setPreferredStartsAt}
                  placeholder="Pick date & time"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={busy || !courseId || !instructorId}
                onClick={() =>
                  void run(() =>
                    assignPost({
                      action: "assign",
                      courseId,
                      instructorId,
                      preferredStartsAt: preferredStartsAt
                        ? new Date(preferredStartsAt).toISOString()
                        : null,
                      scheduleNow: Boolean(preferredStartsAt),
                      autoZoom: true,
                    }),
                  )
                }
              >
                Assign
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !courseId || !instructorId}
                onClick={() =>
                  void run(() =>
                    assignPost({
                      action: "reassign",
                      courseId,
                      instructorId,
                      moveFutureClasses: true,
                    }),
                  )
                }
              >
                Reassign
              </Button>
              <Button
                variant="outline"
                disabled={busy || !courseId || !instructorId}
                onClick={() =>
                  void run(() =>
                    assignPost({
                      action: "schedule",
                      courseId,
                      instructorId,
                      lessonTitle: "ATPL coaching session",
                      startsAt: preferredStartsAt
                        ? new Date(preferredStartsAt).toISOString()
                        : undefined,
                      autoZoom: true,
                    }),
                  )
                }
              >
                Schedule + Zoom
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: if the instructor has no free slot, the request enters the waiting queue instead
              of failing silently.
            </p>
          </div>
        </Panel>

        <Panel
          id="waiting-queue"
          step={2}
          title="Waiting queue"
          hint="Students or lectures waiting for an open instructor slot. Process queue retries scheduling automatically."
          count={data.queue.length}
          tone={data.queue.length ? "action" : "ok"}
          defaultOpen={data.queue.length > 0}
          actions={
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void run(() => assignPost({ action: "process_queue" }));
              }}
            >
              Process queue
            </Button>
          }
        >
          {data.queue.length === 0 ? (
            <EmptyState message="Queue is empty." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.queue.map((q) => (
                <li key={q.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {instructorNameById.get(q.instructorId) ?? "Instructor"}
                      </p>
                      <p className="text-muted-foreground">
                        Request {q.assignmentRequestId.slice(0, 8)}
                        {q.preferredStartsAt
                          ? ` · preferred ${new Date(q.preferredStartsAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="recent-requests"
          step={3}
          title="Recent assignment requests"
          hint="Blocked and queued requests first. Use Fix in assign to load the form, or Retry schedule after clearing calendar conflicts."
          count={data.recentRequests.filter(needsAttention).length}
          tone={data.counts.unable > 0 || data.counts.schedulingRequired > 0 ? "warn" : "neutral"}
          defaultOpen={
            data.counts.unable > 0 ||
            data.counts.schedulingRequired > 0 ||
            data.recentRequests.length > 0
          }
        >
          <RecentRequestsBoard
            requests={data.recentRequests}
            busy={busy}
            onFix={(request) => {
              setCourseId(request.courseId || courseId);
              setInstructorId(request.instructorId || instructorId);
              if (request.preferredStartsAt) {
                const local = new Date(request.preferredStartsAt);
                const pad = (n: number) => String(n).padStart(2, "0");
                setPreferredStartsAt(
                  `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
                );
              }
              document.getElementById("assign-action")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            onRetrySchedule={(request) =>
              void run(() =>
                assignPost({
                  action: "schedule",
                  courseId: request.courseId,
                  instructorId: request.instructorId,
                  lessonTitle: request.lessonTitle || "ATPL coaching session",
                  startsAt: request.preferredStartsAt || undefined,
                  autoZoom: true,
                }),
              )
            }
            onProcessQueue={() => void run(() => assignPost({ action: "process_queue" }))}
          />
        </Panel>

        <Panel
          id="instructor-calendar"
          step={4}
          title="Instructor calendar"
          hint="Availability windows and live sessions for the selected instructor. Use this before Assign / Schedule to avoid conflicts."
          tone="neutral"
          defaultOpen={Boolean(calendar?.events.length)}
        >
          <div className="form-row-responsive">
            <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
              <Label>Instructor</Label>
              <Select value={calendarInstructorId} onValueChange={setCalendarInstructorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Instructor" />
                </SelectTrigger>
                <SelectContent>
                  {data.instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.windows ? ` · ${i.windows} windows` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !calendarInstructorId}
              onClick={() =>
                void run(() =>
                  assignPost({
                    action: "set_availability",
                    instructorId: calendarInstructorId,
                    windows: [1, 2, 3, 4, 5].map((weekday) => ({
                      weekday,
                      startTime: "09:00",
                      endTime: "17:00",
                      timezone: "UTC",
                    })),
                  }),
                )
              }
            >
              Set Mon–Fri 09–17 availability
            </Button>
          </div>

          {calendar ? (
            <InstructorCalendarBoard calendar={calendar} />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Select an instructor to load calendar.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
