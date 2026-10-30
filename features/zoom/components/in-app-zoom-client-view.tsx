"use client";

import "@/styles/classroom.css";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PhoneOff, Shield } from "lucide-react";

import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import {
  ensureZoomClientViewRoot,
  initZoomClientViewMeeting,
  joinZoomClientViewMeeting,
  leaveZoomClientViewMeeting,
  loadZoomClientView,
  prefetchZoomClientViewSdk,
  type ZoomMtgClient,
} from "@/features/zoom/lib/load-client-view-sdk";
import { cn } from "@/lib/utils";

interface InAppSession {
  mode: "sdk" | "classroom";
  meetingNumber: string;
  password: string;
  userName: string;
  userEmail: string;
  signature: string | null;
  hostSignature?: string | null;
  zak: string | null;
  role: 0 | 1;
}

interface InAppZoomClientViewProps {
  liveClassId?: string | null;
  joinUrl: string;
  startUrl?: string | null;
  meetingNumber?: string | null;
  password?: string | null;
  isHost?: boolean;
  providerMode?: string | null;
  title?: string;
  displayName?: string;
  instructorName?: string | null;
  leaveHref?: string;
  onLeave?: () => void;
  className?: string;
  onPhaseChange?: (phase: "loading" | "classroom" | "sdk" | "error") => void;
}

function zoomFailureText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const row = error as { reason?: unknown; errorCode?: unknown; message?: unknown };
    return [row.errorCode, row.reason, row.message]
      .filter((part) => part != null && part !== "")
      .join(" ");
  }
  return String(error ?? "");
}

function InAppZoomClientView({
  liveClassId = null,
  joinUrl,
  startUrl,
  meetingNumber,
  password,
  isHost = false,
  providerMode = null,
  title = "Live class",
  displayName,
  instructorName = null,
  leaveHref = routes.dashboard,
  onLeave,
  className,
  onPhaseChange,
}: InAppZoomClientViewProps) {
  const router = useRouter();
  const [session, setSession] = React.useState<InAppSession | null>(null);
  const [phase, setPhase] = React.useState<"loading" | "classroom" | "sdk" | "error">("loading");
  const [attempt, setAttempt] = React.useState(0);
  const [notice, setNotice] = React.useState("Preparing the mobile Zoom classroom");
  const [leftLobby, setLeftLobby] = React.useState(false);
  const liveMeetingRef = React.useRef(false);
  const joinedKeyRef = React.useRef<string | null>(null);
  const mtgRef = React.useRef<ZoomMtgClient | null>(null);
  const sessionRef = React.useRef<InAppSession | null>(null);
  sessionRef.current = session;

  const sessionJoinKey = session
    ? [session.mode, session.meetingNumber, String(attempt)].join("|")
    : null;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("left") === "1") setLeftLobby(true);
  }, []);

  React.useEffect(() => {
    if (phase === "loading" && liveMeetingRef.current) return;
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  React.useEffect(() => {
    if (providerMode === "zoom") prefetchZoomClientViewSdk();
  }, [providerMode]);

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (liveMeetingRef.current && joinedKeyRef.current) {
        console.info("[zoom-client] boot skipped — meeting already live", {
          meeting: meetingNumber,
          attempt,
        });
        return;
      }
      const result = await authFetch<InAppSession>("/api/zoom/in-app-session", {
        method: "POST",
        body: JSON.stringify({
          liveClassId: liveClassId || undefined,
          joinUrl,
          startUrl,
          meetingNumber,
          password,
          isHost,
          providerMode,
        }),
      });
      if (cancelled) return;
      if (!result.success || !result.data) {
        if (liveMeetingRef.current) return;
        setNotice(result.error ?? "Classroom is ready inside AviatorPass.");
        setSession({
          mode: "classroom",
          meetingNumber: meetingNumber ?? "",
          password: password ?? "",
          userName: displayName?.trim() || "AviatorPass student",
          userEmail: "",
          signature: null,
          hostSignature: null,
          zak: null,
          role: isHost ? 1 : 0,
        });
        setPhase("classroom");
        return;
      }
      if (result.data.mode === "sdk") prefetchZoomClientViewSdk();
      if (liveMeetingRef.current) return;
      setSession(result.data);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    displayName,
    isHost,
    joinUrl,
    liveClassId,
    meetingNumber,
    password,
    providerMode,
    startUrl,
  ]);

  React.useEffect(() => {
    if (!sessionJoinKey || !sessionRef.current) return;
    const active = sessionRef.current;
    let cancelled = false;

    async function enter() {
      if (
        joinedKeyRef.current === sessionJoinKey &&
        liveMeetingRef.current &&
        active.mode === "sdk"
      ) {
        setPhase("sdk");
        return;
      }

      if (active.mode !== "sdk" || !active.signature || !active.meetingNumber) {
        setPhase("classroom");
        setNotice(
          "This environment has no live Meeting SDK meeting (mock/demo). On Production with Zoom configured, Client View opens automatically — no personal Zoom account needed.",
        );
        return;
      }

      // Returning from Zoom leaveUrl — wait for explicit Rejoin tap.
      if (leftLobby && !liveMeetingRef.current) {
        setPhase("classroom");
        setNotice("You left the Zoom classroom. Tap Rejoin when you are ready.");
        return;
      }

      try {
        setPhase("loading");
        setNotice("Opening Zoom Client View…");
        ensureZoomClientViewRoot();
        const mtg = await loadZoomClientView();
        if (cancelled) return;
        mtgRef.current = mtg;

        const leaveUrl =
          typeof window !== "undefined" && liveClassId
            ? `${window.location.origin}/join/${liveClassId}?left=1`
            : typeof window !== "undefined"
              ? `${window.location.origin}${leaveHref}`
              : leaveHref;

        // Init can hang without #zmmtg-root — bound it. join() paints Zoom's own
        // preview/Join screen and resolves only after the participant enters;
        // do not race-fail that interactive step.
        const withTimeout = <T,>(promise: Promise<T>, label: string, ms: number) =>
          Promise.race([
            promise,
            new Promise<T>((_, reject) =>
              window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
            ),
          ]);

        await withTimeout(initZoomClientViewMeeting(mtg, { leaveUrl }), "Client View init", 30000);
        if (cancelled) return;

        const joinPayload = {
          signature: active.hostSignature || active.signature,
          meetingNumber: active.meetingNumber,
          passWord: active.password || "",
          userName: displayName?.trim() || active.userName || (isHost ? "Instructor" : "Student"),
          userEmail: active.userEmail || "",
          tk: "",
          ...(active.zak ? { zak: active.zak } : {}),
        };

        await joinZoomClientViewMeeting(mtg, joinPayload);
        if (cancelled) return;

        joinedKeyRef.current = sessionJoinKey;
        liveMeetingRef.current = true;
        setLeftLobby(false);
        setPhase("sdk");
        setNotice("Live Zoom Client View is running");
        console.info("[zoom-client] Meeting SDK Client View joined", {
          meeting: active.meetingNumber,
          key: sessionJoinKey,
          host: Boolean(active.zak),
        });
      } catch (error) {
        if (cancelled) return;
        console.error("[zoom-client] Client View join failed", error);
        liveMeetingRef.current = false;
        joinedKeyRef.current = null;
        setPhase("error");
        const detail = zoomFailureText(error);
        setNotice(
          /3712|signature is invalid/i.test(detail)
            ? "Zoom error 3712 — Meeting SDK signature rejected. Super Admin: verify ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET pair (Meeting SDK app)."
            : /3000|other meetings in progress/i.test(detail)
              ? "Zoom Error 3000 — host already in another meeting. Leave other Zoom sessions for the platform host, then retry."
              : `Could not open Zoom Client View (${detail || "unknown error"}).`,
        );
      }
    }

    void enter();
    return () => {
      cancelled = true;
      // Do not leaveMeeting on identity-stable re-renders. Only clear flags when
      // the effect identity changes or the component unmounts before join completes.
      if (joinedKeyRef.current !== sessionJoinKey) {
        liveMeetingRef.current = false;
      }
    };
  }, [displayName, isHost, leaveHref, leftLobby, liveClassId, sessionJoinKey]);

  async function leaveClassroom() {
    const mtg = mtgRef.current;
    liveMeetingRef.current = false;
    joinedKeyRef.current = null;
    if (mtg) {
      try {
        await leaveZoomClientViewMeeting(mtg, false);
      } catch {
        /* navigation fallback below */
      }
    }
    if (onLeave) {
      onLeave();
      return;
    }
    router.push(leaveHref);
  }

  function rejoinClassroom() {
    setLeftLobby(false);
    liveMeetingRef.current = false;
    joinedKeyRef.current = null;
    setSession(null);
    setPhase("loading");
    setNotice("Reopening the Zoom classroom");
    setAttempt((value) => value + 1);
    if (typeof window !== "undefined" && liveClassId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("left");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }

  const personName =
    displayName?.trim() || session?.userName || (isHost ? "Instructor" : "Student");
  const hostLabel = instructorName?.trim() || (isHost ? personName : "Instructor");
  const shownMeeting = session?.meetingNumber || meetingNumber || "";
  const liveZoom = phase === "sdk";

  // After join, Zoom Client View owns the full page — do not overlay AviatorPass
  // chrome (that was the Leave/toolbar conflict on Component View mobile).
  if (liveZoom) {
    return (
      <div
        className={cn("classroom-client-view is-live sr-only", className)}
        data-sdk-view="client"
        aria-live="polite"
      >
        In the meeting · Zoom Client View
      </div>
    );
  }

  return (
    <div
      className={cn("classroom-client-view text-white", className)}
      data-sdk-view="client"
      style={{
        width: "100%",
        flex: "1 1 auto",
        minHeight: 0,
        color: "#fff",
      }}
    >
      <div className="classroom-client-lobby">
        <div className="classroom-client-lobby-card">
          <p className="classroom-client-eyebrow">AviatorPass · Zoom Client View</p>
          <h2>{title}</h2>
          <p className="classroom-client-meta">
            Host <strong>{hostLabel}</strong>
            {shownMeeting ? (
              <>
                {" "}
                · Meeting ID <strong>{shownMeeting}</strong>
              </>
            ) : null}
          </p>
          <p className="classroom-client-copy" role="status">
            {notice}
          </p>
          {phase === "error" ? (
            <div className="classroom-notice" role="alert">
              <Shield className="mt-0.5 size-4 shrink-0 text-[#CCA04C]" />
              <div className="min-w-0">
                <p>{notice}</p>
              </div>
            </div>
          ) : null}
          <div className="classroom-client-actions">
            {leftLobby || phase === "error" || phase === "classroom" ? (
              <button
                type="button"
                className="classroom-dock-btn"
                data-reconnect="true"
                onClick={() => rejoinClassroom()}
              >
                {leftLobby ? "Rejoin class" : "Open classroom again"}
              </button>
            ) : null}
            <button
              type="button"
              className="classroom-dock-btn"
              data-leave="true"
              onClick={() => void leaveClassroom()}
            >
              <PhoneOff className="size-4" />
              Leave Class
            </button>
          </div>
          <p className="classroom-client-footnote">
            No personal Zoom account is required. You stay signed in to AviatorPass. After you
            enter, Zoom’s Client View fills the screen; leave with Zoom’s control to return here and
            rejoin.
          </p>
        </div>
      </div>
    </div>
  );
}

export { InAppZoomClientView };
