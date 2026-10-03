"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "@/components/ui/app-link";
import { Copy, Shield } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
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

function JoinClassClient({ classId }: JoinClassClientProps) {
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
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await classFetch<NonNullable<typeof data>>(`/api/classes/${classId}/join`, {
        method: "POST",
        body: "{}",
      });
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? "Unable to join");
        setData(null);
      } else {
        setData(result.data);
        setError(null);
        if (result.data.join?.providerMode === "zoom") prefetchZoomEmbeddedSdk();
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  if (loading) {
    return (
      <div className="classroom-shell relative overflow-hidden">
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div className="h-10 w-40 rounded-full bg-white/10" />
          <div className="classroom-stage-skeleton" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="classroom-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div className="relative z-10 max-w-md">
          <BrandLogo variant="dark" href="/login" priority />
          <h1 className="mt-8 font-display text-3xl font-semibold">Unable to join</h1>
          <p className="mt-3 text-sm text-white/65">{error ?? "Class not available"}</p>
          <Button asChild className="mt-8" variant="accent">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const cls = data.class;
  const join = data.join;
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

  return (
    <div className="classroom-shell relative overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
        <header className="flex items-center justify-between gap-3">
          <BrandLogo variant="dark" href="/" priority />
          <span
            className={cn(
              "classroom-chip font-semibold uppercase tracking-[0.16em]",
              audience === "Live" && "text-[#F6C36C]",
            )}
          >
            {audience === "Live" ? <span className="classroom-live-dot" /> : null}
            {audience}
          </span>
        </header>

        <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#CCA04C]">
              Live classroom
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {cls.title}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {new Date(cls.startsAt).toLocaleString()} · {cls.durationMinutes} min
              {!finished ? (
                <>
                  {" "}
                  · Starts <MeetingCountdown startsAt={cls.startsAt} />
                </>
              ) : null}
            </p>
          </div>
          {join ? (
            <div className="flex flex-wrap gap-2">
              <span className="classroom-chip">
                <span className="text-white/45">Meeting ID</span>
                <button type="button" onClick={() => copy(join.zoomMeetingId)}>
                  {join.zoomMeetingId}
                </button>
                <button
                  type="button"
                  aria-label="Copy meeting ID"
                  className="text-white/45 hover:text-white"
                  onClick={() => copy(join.zoomMeetingId)}
                >
                  <Copy className="size-3.5" />
                </button>
              </span>
              <span className="classroom-chip">
                <span className="text-white/45">Passcode</span>
                <button type="button" onClick={() => copy(join.password)}>
                  {join.password || "—"}
                </button>
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex-1 pb-4">
          {join && audience !== "Cancelled" ? (
            <InAppZoomRoom
              joinUrl={join.joinUrl}
              startUrl={join.startUrl}
              meetingNumber={join.zoomMeetingId}
              password={join.password}
              isHost={data.isHost}
              providerMode={join.providerMode}
              title={cls.title}
              leaveHref={routes.studentDashboard}
            />
          ) : (
            <p className="rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-white/65">
              {audience === "Cancelled"
                ? "This class was cancelled."
                : "Meeting details unavailable."}
            </p>
          )}
          {join ? (
            <p className="mt-4 flex items-center gap-2 text-xs text-white/45">
              <Shield className="size-3.5" />
              {join.providerMode === "mock"
                ? "Live classroom on AviatorPass"
                : "Zoom meeting inside AviatorPass"}
              {join.waitingRoom ? " · Waiting room on" : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { JoinClassClient };
