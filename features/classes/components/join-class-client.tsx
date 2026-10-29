"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "@/components/ui/app-link";
import { ArrowLeft, BookOpen, Plane } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { ROLE_DASHBOARD, type Role } from "@/constants/roles";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import { useAuth } from "@/providers/auth-provider";
import { classFetch } from "@/features/classes/lib/api";
import { prefetchZoomEmbeddedSdk } from "@/features/zoom/lib/load-embedded-sdk";
import { MeetingCountdown } from "@/features/zoom/components/meeting-countdown";
import type { LiveClassListItem } from "@/types/classes";
import { cn } from "@/lib/utils";

const InAppZoomRoom = dynamic(
  () => import("@/features/zoom/components/in-app-zoom-room").then((mod) => mod.InAppZoomRoom),
  {
    ssr: false,
    loading: () => <div className="classroom-stage-skeleton" aria-hidden />,
  },
);

interface JoinClassClientProps {
  classId: string;
}

function formatRange(startsAt: string, durationMinutes: number): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const date = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${startTime} – ${endTime}`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AP";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type JoinGate =
  | { kind: "ok" }
  | { kind: "auth" }
  | { kind: "forbidden"; message: string }
  | { kind: "error"; message: string };

function JoinClassClient({ classId }: JoinClassClientProps) {
  const { user, isLoading: authLoading } = useAuth();
  const leaveHref =
    user && user.role in ROLE_DASHBOARD
      ? ROLE_DASHBOARD[user.role as Role]
      : routes.studentDashboard;
  const loginHref = `${routes.login}?next=${encodeURIComponent(`/join/${classId}`)}`;
  const [data, setData] = React.useState<{
    class: LiveClassListItem;
    join: {
      zoomMeetingId: string;
      joinUrl: string;
      startUrl: string | null;
      password: string;
      waitingRoom: boolean;
      providerMode: string;
    } | null;
    isHost: boolean;
    audienceStatus?: "Upcoming" | "Live" | "Finished" | "Cancelled";
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [gate, setGate] = React.useState<JoinGate>({ kind: "ok" });
  const [roomPhase, setRoomPhase] = React.useState<"loading" | "classroom" | "sdk" | "error">(
    "loading",
  );
  const [panelTab, setPanelTab] = React.useState<"info" | "chat" | "notes" | "resources">("info");
  const joinedAtRef = React.useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  React.useEffect(() => {
    // Wait for AuthProvider to finish — never bounce to Login while session
    // resolution is still in flight.
    if (authLoading) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setGate({ kind: "ok" });
      const result = await classFetch<NonNullable<typeof data>>(`/api/classes/${classId}/join`, {
        method: "POST",
        body: "{}",
      });
      if (cancelled) return;
      if (!result.success || !result.data) {
        setData(null);
        const message = result.error ?? "Unable to join";
        const unauthorized =
          result.status === 401 || /authentication required|sign in|unauthorized/i.test(message);
        const forbidden =
          result.status === 403 ||
          /not invited|access denied|forbidden|inactive|suspended/i.test(message);
        if (unauthorized) {
          setGate({ kind: "auth" });
        } else if (forbidden) {
          setGate({ kind: "forbidden", message });
        } else {
          setGate({ kind: "error", message });
        }
      } else {
        setData(result.data);
        setGate({ kind: "ok" });
        if (result.data.join?.providerMode === "zoom") prefetchZoomEmbeddedSdk();
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [classId, authLoading]);

  React.useEffect(() => {
    if (roomPhase === "sdk") {
      if (!joinedAtRef.current) joinedAtRef.current = Date.now();
    } else if (roomPhase === "loading") {
      joinedAtRef.current = null;
      setElapsedMs(0);
    }
  }, [roomPhase]);

  React.useEffect(() => {
    if (roomPhase !== "sdk" || !joinedAtRef.current) return;
    const tick = () => {
      if (!joinedAtRef.current) return;
      setElapsedMs(Date.now() - joinedAtRef.current);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [roomPhase]);

  React.useEffect(() => {
    if (gate.kind !== "auth") return;
    let cancelled = false;
    // Clear a stale JWT (middleware-valid / API-401) before Login so
    // middleware does not bounce ?next=/join straight back into a loop.
    void (async () => {
      try {
        await authFetch(routes.api.auth.logout, { method: "POST", body: "{}" });
      } catch {
        /* ignore — still send the user to Login with return path */
      }
      if (!cancelled) window.location.replace(loginHref);
    })();
    return () => {
      cancelled = true;
    };
  }, [gate.kind, loginHref]);

  if (authLoading || loading || gate.kind === "auth") {
    return (
      <div
        className="classroom-shell relative overflow-hidden"
        style={{ backgroundColor: "#071018", color: "#fff", minHeight: "100dvh" }}
      >
        <div className="classroom-page">
          <div className="h-10 w-40 rounded-full bg-white/10" />
          <div className="classroom-stage-skeleton" />
        </div>
      </div>
    );
  }

  if (gate.kind === "forbidden") {
    return (
      <div
        className="classroom-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ backgroundColor: "#071018", color: "#fff" }}
      >
        <div className="relative z-10 max-w-md">
          <BrandLogo variant="dark" href={leaveHref} priority />
          <h1 className="mt-8 font-display text-3xl font-semibold">Access denied</h1>
          <p className="mt-3 text-sm text-white/65">
            {gate.message || "You are signed in, but you are not allowed to enter this class."}
          </p>
          <Button asChild className="mt-8" variant="accent">
            <Link href={leaveHref}>Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (gate.kind === "error" || !data) {
    return (
      <div
        className="classroom-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ backgroundColor: "#071018", color: "#fff" }}
      >
        <div className="relative z-10 max-w-md">
          <BrandLogo variant="dark" href={leaveHref} priority />
          <h1 className="mt-8 font-display text-3xl font-semibold">Unable to join</h1>
          <p className="mt-3 text-sm text-white/65">
            {gate.kind === "error" ? gate.message : "Class not available"}
          </p>
          <Button asChild className="mt-8" variant="accent">
            <Link href={leaveHref}>Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const cls = data.class;
  const join = data.join;
  const displayName =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    (data.isHost ? "Instructor" : "Student");
  const audience =
    data.audienceStatus ??
    (cls.computedStatus === "live_now"
      ? "Live"
      : cls.computedStatus === "completed" || cls.status === "completed"
        ? "Finished"
        : cls.status === "cancelled"
          ? "Cancelled"
          : "Upcoming");
  const finished = audience === "Finished" || audience === "Cancelled";
  const instructorName = cls.instructorName?.trim() || "Instructor";
  const liveNow = audience === "Live" || roomPhase === "sdk";
  const statusLabel =
    roomPhase === "sdk"
      ? "In the meeting"
      : roomPhase === "error"
        ? "Reconnect"
        : roomPhase === "loading"
          ? "Connecting"
          : audience === "Live"
            ? "Ready"
            : audience;
  const statusState =
    roomPhase === "sdk"
      ? "live"
      : roomPhase === "error"
        ? "error"
        : roomPhase === "loading"
          ? "loading"
          : "ready";

  return (
    <div
      className="classroom-shell relative"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        height: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
        backgroundColor: "#071018",
        color: "#fff",
      }}
    >
      <div className="classroom-page relative z-10" data-live={roomPhase === "sdk" || undefined}>
        <header className="classroom-topbar">
          <BrandLogo variant="dark" href="/" priority />
          <div className="classroom-topbar-user">
            <div className="classroom-topbar-avatar" aria-hidden>
              {initialsOf(displayName)}
            </div>
            <div className="classroom-topbar-meta">
              <strong>{displayName}</strong>
              <span>{data.isHost ? "Instructor" : "Student"}</span>
            </div>
          </div>
        </header>

        <section className="classroom-meet-head" aria-label="Meeting header">
          <div className="classroom-meet-head-main">
            <Link href={leaveHref} className="classroom-back" aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Link>
            <div className="classroom-meet-copy">
              <div className="classroom-meet-title-row">
                {liveNow ? <span className="classroom-badge-live">Live</span> : null}
                <h1>{cls.title}</h1>
              </div>
              <div className="classroom-meet-meta">
                <span>{formatRange(cls.startsAt, cls.durationMinutes)}</span>
                <span>
                  Host <strong>{instructorName}</strong>
                </span>
                {!finished && roomPhase !== "sdk" ? (
                  <span>
                    <MeetingCountdown startsAt={cls.startsAt} />
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="classroom-meet-actions">
            <span className="classroom-status-pill" data-state={statusState}>
              <span className="classroom-status-dot" aria-hidden />
              {statusLabel}
              {roomPhase === "sdk" ? (
                <span className="classroom-timer">{formatElapsed(elapsedMs)}</span>
              ) : null}
            </span>
            <a className="classroom-materials-btn" href="#class-materials">
              <BookOpen className="size-3.5" />
              <span>Class Materials</span>
            </a>
          </div>
        </section>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {join && cls.status !== "completed" && audience !== "Cancelled" ? (
            <InAppZoomRoom
              liveClassId={classId}
              joinUrl={join.joinUrl}
              startUrl={join.startUrl}
              meetingNumber={join.zoomMeetingId}
              password={join.password}
              isHost={data.isHost}
              providerMode={join.providerMode}
              title={cls.title}
              displayName={displayName}
              instructorName={instructorName}
              leaveHref={leaveHref}
              onPhaseChange={setRoomPhase}
            />
          ) : (
            <p className="rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/65">
              {audience === "Cancelled"
                ? "This class was cancelled."
                : cls.status === "completed"
                  ? "This subject is complete and will not open again."
                  : "Meeting details unavailable."}
            </p>
          )}

          <section className="classroom-panel" id="class-materials" aria-label="Class details">
            <div className="classroom-tabs" role="tablist">
              {(
                [
                  ["info", "Class Info"],
                  ["chat", "Chat"],
                  ["notes", "Notes"],
                  ["resources", "Resources"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className="classroom-tab"
                  data-active={panelTab === id || undefined}
                  aria-selected={panelTab === id}
                  onClick={() => setPanelTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="classroom-panel-body" role="tabpanel">
              {panelTab === "info" ? (
                <>
                  <div className="classroom-info-main">
                    <div className="classroom-info-icon" aria-hidden>
                      <Plane className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h2>{cls.title}</h2>
                      <p>
                        {cls.description?.trim() ||
                          "Live AviatorPass classroom. Stay on this page for video, audio, chat, and screen share."}
                      </p>
                    </div>
                  </div>
                  <div className="classroom-info-side">
                    <div>
                      <span>Schedule</span>
                      <strong>{formatRange(cls.startsAt, cls.durationMinutes)}</strong>
                    </div>
                    <div>
                      <span>Instructor</span>
                      <strong>{instructorName}</strong>
                    </div>
                    <div>
                      <span>Duration</span>
                      <strong>{cls.durationMinutes} min</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong className={cn(liveNow && "text-[#86efac]")}>{audience}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-white/60">
                  {panelTab === "chat"
                    ? "Meeting chat opens from the control bar while you are in the live Zoom session."
                    : panelTab === "notes"
                      ? "Personal lecture notes will appear here in a later release."
                      : "Class resources and handouts will appear here when the instructor attaches them."}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export { JoinClassClient };
