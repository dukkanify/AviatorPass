"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "@/components/ui/app-link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { ROLE_DASHBOARD, type Role } from "@/constants/roles";
import { routes } from "@/constants/routes";
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

function JoinClassClient({ classId }: JoinClassClientProps) {
  const { user } = useAuth();
  const leaveHref =
    user && user.role in ROLE_DASHBOARD
      ? ROLE_DASHBOARD[user.role as Role]
      : routes.studentDashboard;
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

  if (loading) {
    return (
      <div
        className="classroom-shell relative overflow-hidden"
        style={{ backgroundColor: "#071018", color: "#fff", minHeight: "100dvh" }}
      >
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div className="h-10 w-40 rounded-full bg-white/10" />
          <div className="classroom-stage-skeleton" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="classroom-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ backgroundColor: "#071018", color: "#fff" }}
      >
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

  return (
    <div
      className="classroom-shell relative"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        minHeight: "100dvh",
        overflow: "hidden",
        backgroundColor: "#071018",
        color: "#fff",
      }}
    >
      <div className="classroom-page relative z-10 mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <BrandLogo variant="dark" href="/" priority />
          <div className="min-w-0 flex-1 px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CCA04C]">
              Live classroom
            </p>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-white sm:text-2xl">
              {cls.title}
            </h1>
            <p className="truncate text-xs text-white/55">
              {new Date(cls.startsAt).toLocaleString()} · {cls.durationMinutes} min
              {!finished ? (
                <>
                  {" "}
                  · <MeetingCountdown startsAt={cls.startsAt} />
                </>
              ) : null}
            </p>
          </div>
          <span
            className={cn(
              "classroom-chip shrink-0 font-semibold uppercase tracking-[0.16em]",
              audience === "Live" && "text-[#F6C36C]",
            )}
          >
            {audience === "Live" ? <span className="classroom-live-dot" /> : null}
            {audience}
          </span>
        </header>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {join && cls.status !== "completed" && audience !== "Cancelled" ? (
            <InAppZoomRoom
              joinUrl={join.joinUrl}
              startUrl={join.startUrl}
              meetingNumber={join.zoomMeetingId}
              password={join.password}
              isHost={data.isHost}
              providerMode={join.providerMode}
              title={cls.title}
              displayName={displayName}
              leaveHref={leaveHref}
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
        </div>
      </div>
    </div>
  );
}

export { JoinClassClient };
