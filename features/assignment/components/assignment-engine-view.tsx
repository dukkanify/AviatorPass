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
import { Input } from "@/components/ui/input";
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
    lessonTitle: string;
    status: string;
    instructorId: string;
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
        tone === "action" && "border-accent/40 bg-accent/10 text-accent",
        tone === "ok" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
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
          {open ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{hint}</p> : null}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600/80" aria-hidden />
      <p>{message}</p>
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
      <PageHeader
        title="Assignment Engine"
        description="CGI scheduling desk — assign or reassign ATPL instructors, clear the waiting queue, then check calendar conflicts before Zoom."
        breadcrumbs={[{ label: "CGI" }, { label: "Assignment Engine" }]}
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
                ? "1 assignment item needs CGI action"
                : `${actionNeeded} assignment items need CGI action`
              : "No urgent assignment items right now"}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="#assign-action"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
          >
            Assign / reassign
          </a>
          <a
            href="#waiting-queue"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
              data.counts.waitingQueue > 0
                ? "border-accent/40 bg-background hover:bg-accent/10"
                : "border-border/70 bg-background/60 text-muted-foreground",
            )}
          >
            Waiting queue <span className="tabular-nums">{data.counts.waitingQueue}</span>
          </a>
          <a
            href="#recent-requests"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
              data.counts.schedulingRequired > 0 || data.counts.unable > 0
                ? "border-accent/40 bg-background hover:bg-accent/10"
                : "border-border/70 bg-background/60 text-muted-foreground",
            )}
          >
            Needs schedule <span className="tabular-nums">{data.counts.schedulingRequired}</span>
          </a>
          <a
            href="#instructor-calendar"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
          >
            Instructor calendar
          </a>
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
              <div className="min-w-0 w-full space-y-1.5 sm:w-auto sm:min-w-[180px]">
                <Label>Preferred start (optional)</Label>
                <Input
                  type="datetime-local"
                  value={preferredStartsAt}
                  onChange={(e) => setPreferredStartsAt(e.target.value)}
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
          hint="Latest assign / schedule attempts. Check conflict and unable reasons here before retrying."
          count={data.recentRequests.length}
          tone={data.counts.unable > 0 || data.counts.schedulingRequired > 0 ? "warn" : "neutral"}
          defaultOpen={
            data.counts.unable > 0 ||
            data.counts.schedulingRequired > 0 ||
            data.recentRequests.length > 0
          }
        >
          {data.recentRequests.length === 0 ? (
            <EmptyState message="No requests yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentRequests.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.lessonTitle}</p>
                      <p className="text-muted-foreground">
                        {r.kind.replaceAll("_", " ")}
                        {instructorNameById.get(r.instructorId)
                          ? ` · ${instructorNameById.get(r.instructorId)}`
                          : ""}
                        {r.queuePosition ? ` · queue #${r.queuePosition}` : ""}
                        {r.zoomMeetingId ? ` · Zoom ${r.zoomMeetingId}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.conflictSummary ? (
                    <p className="mt-2 text-amber-700 dark:text-amber-400">
                      Conflict: {r.conflictSummary}
                    </p>
                  ) : null}
                  {r.unableReason ? (
                    <p className="mt-2 text-destructive">Unable: {r.unableReason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="instructor-calendar"
          step={4}
          title="Instructor calendar"
          hint="Check weekly availability windows and upcoming events before assigning overlapping lectures."
          tone="neutral"
          defaultOpen={false}
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
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                <CalendarClock className="mr-1 inline h-4 w-4" />
                {calendar.instructorName} · {calendar.availability.length} weekly windows ·{" "}
                {calendar.queue.length} queued
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <h3 className="text-sm font-semibold">Weekly availability</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {calendar.availability.length === 0 ? (
                      <li>No availability windows set.</li>
                    ) : (
                      calendar.availability.map((w, idx) => (
                        <li key={`${w.weekday}-${idx}`}>
                          {WEEKDAYS[w.weekday]} {w.startTime}–{w.endTime}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <h3 className="text-sm font-semibold">Upcoming events</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {calendar.events.length === 0 ? (
                      <li className="text-muted-foreground">No calendar events in range.</li>
                    ) : (
                      calendar.events.slice(0, 24).map((e) => (
                        <li key={e.id} className="border-b border-border/60 pb-2 last:border-0">
                          <span className="font-medium">{e.title}</span>
                          <div className="text-muted-foreground">
                            {e.type} · {e.status} · {new Date(e.startsAt).toLocaleString()}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
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
