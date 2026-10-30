"use client";

import "@/styles/classroom.css";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Shield, Video, VideoOff } from "lucide-react";

import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import { waitForEmbeddedConnected } from "@/features/zoom/lib/embedded-connection";
import {
  openZoomEmbeddedClient,
  prefetchZoomEmbeddedSdk,
  releaseZoomEmbeddedClient,
  type ZoomEmbeddedClient,
} from "@/features/zoom/lib/load-embedded-sdk";
import { cn } from "@/lib/utils";

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

function zoomErrorCodeOf(error: unknown): number | null {
  if (error && typeof error === "object" && "errorCode" in error) {
    const code = Number((error as { errorCode?: unknown }).errorCode);
    return Number.isFinite(code) ? code : null;
  }
  const text = zoomFailureText(error);
  const match = text.match(/\b(3000|3712|200|3099)\b/);
  return match ? Number(match[1]) : null;
}

function zoomStageDialogText(root: HTMLElement | null): string {
  return root?.innerText ?? "";
}

function zoomStageShowsHostBusy(root: HTMLElement | null): boolean {
  return /already has other meetings in progress/i.test(zoomStageDialogText(root));
}

function zoomStageShowsInvalidSignature(root: HTMLElement | null): boolean {
  return /signature is invalid/i.test(zoomStageDialogText(root));
}

function zoomDomJoinError(root: HTMLElement | null): Error | null {
  if (zoomStageShowsInvalidSignature(root)) {
    return new Error("3712 Signature is invalid");
  }
  if (zoomStageShowsHostBusy(root)) {
    return new Error("3000 Already has other meetings in progress");
  }
  return null;
}

/** Dismiss leftover Zoom MUI error dialogs after a successful join(). */
function dismissZoomErrorDialogs(root: HTMLElement | null) {
  if (!root || typeof document === "undefined") return;
  const buttons = [
    ...root.querySelectorAll("button"),
    ...document.querySelectorAll(
      ".zoom-MuiDialog-root button, [id='error-dialog-title'] ~ * button",
    ),
  ];
  for (const button of buttons) {
    const label = (button.textContent || "").trim();
    if (/^(ok|close|got it)$/i.test(label)) {
      (button as HTMLButtonElement).click();
      break;
    }
  }
}

/**
 * Join Meeting SDK. Prefer the SDK promise. Only treat painted dialogs as
 * failures when join() rejects or never settles — never race-fail a live join
 * that already connected media (that left video + a false 3000 banner).
 */
async function joinEmbeddedMeeting(
  client: ZoomEmbeddedClient,
  payload: {
    signature: string;
    meetingNumber: string;
    password: string;
    userName: string;
    userEmail: string;
    tk: string;
    zak?: string;
  },
  stage: HTMLElement,
): Promise<void> {
  let timer = 0;
  const joinedAt = Date.now();
  const joined = client
    .join(payload)
    .then(() => undefined)
    .catch((error: unknown) => {
      throw error instanceof Error ? error : new Error(zoomFailureText(error));
    });

  try {
    await Promise.race([
      joined,
      new Promise<void>((_, reject) => {
        timer = window.setInterval(() => {
          if (Date.now() - joinedAt < 2500) return;
          // Only fail-fast from DOM while join is still pending.
          const painted = zoomDomJoinError(stage);
          if (painted) reject(painted);
        }, 300);
      }),
    ]);
  } catch (error) {
    void joined.catch(() => undefined);
    const painted = zoomDomJoinError(stage);
    if (painted) throw painted;
    throw error instanceof Error ? error : new Error(zoomFailureText(error));
  } finally {
    window.clearInterval(timer);
  }

  // join() resolved — media is connected. Dismiss stale busy dialogs instead of
  // tearing down a working session.
  if (zoomStageShowsHostBusy(stage)) {
    dismissZoomErrorDialogs(stage);
  }
  if (zoomStageShowsInvalidSignature(stage)) {
    throw new Error("3712 Signature is invalid");
  }
}

const CLASSROOM_NARROW_PX = 900;

function stageVideoSize(el: HTMLElement): { width: number; height: number } {
  const box = el.getBoundingClientRect();
  const screenWidth = Math.round(window.innerWidth || box.width || 480);
  const screenHeight = Math.round(window.innerHeight || box.height || 320);
  const narrow = screenWidth < CLASSROOM_NARROW_PX;
  const measuredWidth = Math.round(box.width || el.clientWidth || screenWidth);
  const measuredHeight = Math.round(box.height || el.clientHeight || screenHeight);
  const floorWidth = narrow ? Math.min(320, screenWidth) : 480;
  const floorHeight = narrow ? Math.min(280, Math.round(screenHeight * 0.42)) : 320;
  return {
    width: Math.min(Math.max(measuredWidth, floorWidth), screenWidth),
    height: Math.min(Math.max(measuredHeight, floorHeight), screenHeight),
  };
}

function zoomVideoOptions(stage: HTMLElement) {
  const videoSize = stageVideoSize(stage);
  const narrow =
    (typeof window !== "undefined" ? window.innerWidth : videoSize.width) < CLASSROOM_NARROW_PX;
  // Keep options minimal — avoid post-join video-option thrash that left Zoom UI
  // stuck on "Connecting" after join().
  return {
    isResizable: true,
    defaultViewType: narrow ? ("gallery" as const) : ("speaker" as const),
    viewSizes: {
      default: videoSize,
    },
  };
}

function waitForStageSize(stage: HTMLElement, timeoutMs = 4000): Promise<DOMRect> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const box = stage.getBoundingClientRect();
      if (box.width >= 160 && box.height >= 120) {
        resolve(box);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Zoom stage container has zero size — cannot init Component View"));
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

function grantZoomFrameMedia() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("iframe").forEach((frame) => {
    const src = frame.getAttribute("src") ?? "";
    const label = `${frame.id} ${typeof frame.className === "string" ? frame.className : ""}`;
    if (
      !/zoom/i.test(`${src} ${label}`) &&
      !frame.closest(".classroom-sdk-root, .classroom-stage")
    ) {
      return;
    }
    const allow = frame.getAttribute("allow") ?? "";
    if (/display-capture/i.test(allow)) return;
    frame.setAttribute(
      "allow",
      [allow, "camera", "microphone", "display-capture", "autoplay", "clipboard-write"]
        .filter(Boolean)
        .join("; "),
    );
  });
}

interface InAppZoomRoomProps {
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
  /** Fired when join phase changes so the shell can mirror status/timer. */
  onPhaseChange?: (phase: "loading" | "classroom" | "sdk" | "error") => void;
}

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AP";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function InAppZoomRoom({
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
}: InAppZoomRoomProps) {
  const router = useRouter();
  const stageRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const sdkRef = React.useRef<ZoomEmbeddedClient | null>(null);
  const [session, setSession] = React.useState<InAppSession | null>(null);
  const [phase, setPhase] = React.useState<"loading" | "classroom" | "sdk" | "error">("loading");
  const [attempt, setAttempt] = React.useState(0);
  const [notice, setNotice] = React.useState("Preparing the AviatorPass classroom");
  const [camOn, setCamOn] = React.useState(true);
  const [micOn, setMicOn] = React.useState(true);
  /** Automatic host recovery attempts (ZAK refresh / Error 3000 release). Cap avoids loops. */
  const hostRecoveryRef = React.useRef(0);
  /**
   * Meeting identity that successfully reached phase=sdk.
   * Must NOT include signature/ZAK — reminting JWTs must not leave+rejoin.
   */
  const joinedKeyRef = React.useRef<string | null>(null);
  const liveMeetingRef = React.useRef(false);
  const sessionRef = React.useRef<InAppSession | null>(null);
  sessionRef.current = session;

  // Join effect identity: meeting + attempt only. Signature/ZAK live in sessionRef
  // so boot remints do not tear down a connected Meeting SDK client.
  const sessionJoinKey = session
    ? [session.mode, session.meetingNumber, String(attempt)].join("|")
    : null;

  React.useEffect(() => {
    // Keep shell "In the meeting" while Zoom is already live; only push
    // Connecting before the first successful join (or after a real leave/error).
    if (phase === "loading" && liveMeetingRef.current) return;
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const stopLocalMedia = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startLocalMedia = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("This browser cannot open camera or microphone inside AviatorPass.");
      return;
    }
    if (streamRef.current) {
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => undefined);
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setNotice("Allow camera and microphone in the browser to appear in this classroom.");
    }
  }, []);

  React.useEffect(() => {
    void startLocalMedia();
    return () => stopLocalMedia();
  }, [startLocalMedia, stopLocalMedia]);

  React.useEffect(() => {
    if (providerMode === "zoom") prefetchZoomEmbeddedSdk();
  }, [providerMode]);

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      // While Meeting SDK is live, ignore prop churn from parent soft-refresh —
      // reminting signature/ZAK must not replace session identity mid-call.
      if (liveMeetingRef.current && joinedKeyRef.current) {
        console.info("[zoom] boot skipped — meeting already live", {
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
          userName: "AviatorPass student",
          userEmail: "",
          signature: null,
          hostSignature: null,
          zak: null,
          role: isHost ? 1 : 0,
        });
        return;
      }
      if (result.data.mode === "sdk") prefetchZoomEmbeddedSdk();
      if (liveMeetingRef.current) return;
      setSession(result.data);
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // `attempt` forces a fresh signature/ZAK mint when the user taps reconnect.
  }, [attempt, isHost, joinUrl, liveClassId, meetingNumber, password, providerMode, startUrl]);

  React.useEffect(() => {
    if (!sessionJoinKey || !sessionRef.current) return;
    const active = sessionRef.current;
    let cancelled = false;

    async function enter() {
      // Same meeting identity already joined — do not leave/init/join again
      // (signature remints must not reach this path via sessionJoinKey).
      if (
        joinedKeyRef.current === sessionJoinKey &&
        sdkRef.current &&
        liveMeetingRef.current &&
        active.mode === "sdk"
      ) {
        setPhase("sdk");
        return;
      }

      if (active.mode === "sdk" && active.signature && active.meetingNumber && stageRef.current) {
        try {
          setPhase("loading");
          setNotice("Connecting to Zoom…");
          const client = await openZoomEmbeddedClient();
          if (cancelled) {
            await releaseZoomEmbeddedClient(client);
            return;
          }
          const stage = stageRef.current;
          if (!stage) return;
          await waitForStageSize(stage);
          if (cancelled) {
            await releaseZoomEmbeddedClient(client);
            return;
          }
          // Stop local camera preview so it cannot cover Zoom while Connecting.
          stopLocalMedia();
          const initClient = async (next: ZoomEmbeddedClient) => {
            await next.init({
              zoomAppRoot: stage,
              language: "en-US",
              patchJsMedia: true,
              leaveOnPageUnload: true,
              customize: {
                video: zoomVideoOptions(stage),
              },
            });
          };
          sdkRef.current = client;
          await initClient(client);
          // Subscribe BEFORE join() so Connected during join is not missed.
          const connected = waitForEmbeddedConnected(client, {
            onState: (state) => console.info("[zoom] connection-change", state),
          });
          const participantJoin = {
            signature: active.signature,
            meetingNumber: active.meetingNumber,
            password: active.password,
            userName: active.userName,
            userEmail: active.userEmail,
            tk: "",
          };
          const hostJoinPayload = {
            ...participantJoin,
            signature: active.hostSignature || active.signature,
            zak: active.zak || undefined,
          };
          try {
            if (isHost || active.hostSignature || active.zak) {
              await joinEmbeddedMeeting(client, hostJoinPayload, stage);
            } else {
              await joinEmbeddedMeeting(client, participantJoin, stage);
            }
          } catch (hostError) {
            void connected.catch(() => undefined);
            const detail = zoomFailureText(hostError);
            const code = zoomErrorCodeOf(hostError);
            console.error("[zoom] Meeting SDK join error", { code, detail });

            // Signature failures are credential/JWT issues — do not demote host.
            if (code === 3712 || /3712|signature is invalid/i.test(detail)) throw hostError;

            const hostBusy = code === 3000 || /3000|other meetings in progress/i.test(detail);
            const staleHostToken =
              code === 200 || /(?:^|\D)200(?:\D|$)|start meeting via tokens|\bzak\b/i.test(detail);

            // Assigned hosts must stay hosts for Marketplace proof. Never fall back
            // to participant JWT — that hid Error 3000 and broke HOST verification.
            if (isHost || active.zak || active.hostSignature) {
              if (hostBusy && liveClassId && hostRecoveryRef.current < 2) {
                hostRecoveryRef.current += 1;
                console.warn(
                  "[zoom] Error 3000 from Meeting SDK — releasing this class meeting instance only",
                  detail,
                );
                const release = await authFetch<{
                  released?: boolean;
                  liveListReadable?: boolean;
                  liveListErrors?: Array<{ host: string; status: number; error: string | null }>;
                  otherLiveMeetings?: string[];
                  rootCauseHint?: string;
                  meetingNumber?: string | null;
                }>("/api/zoom/release-host-lock", {
                  method: "POST",
                  body: JSON.stringify({ liveClassId, meetingNumber: active.meetingNumber }),
                });
                console.warn("[zoom] release-host-lock", {
                  success: release.success,
                  released: release.data?.released,
                  liveListReadable: release.data?.liveListReadable,
                  otherLiveCount: release.data?.otherLiveMeetings?.length ?? 0,
                  hint: release.data?.rootCauseHint,
                  errors: release.data?.liveListErrors,
                });
                setNotice(
                  release.data?.liveListReadable === false
                    ? "Zoom Error 3000 — host concurrency blocked. Zoom live lists are not readable with the current Server-to-Server token (often missing meeting:read), so empty clear-live is not proof the host is free. Retrying this classroom meeting only."
                    : "Zoom Error 3000 — ended this classroom meeting instance and retrying as host.",
                );
                liveMeetingRef.current = false;
                joinedKeyRef.current = null;
                setSession(null);
                setPhase("loading");
                setAttempt((value) => value + 1);
                return;
              }
              if (hostBusy) {
                const evidence = `Zoom Error 3000 — Already has other meetings in progress (SDK code ${code ?? 3000}).`;
                console.error("[zoom]", evidence, detail);
                throw new Error(
                  `${evidence} AviatorPass ended only this classroom meeting on the first retry. If it persists, another live session is holding the platform Zoom host (ceo@aviatorpass.com), or Server-to-Server cannot list live meetings (meeting:read). Leave other Zoom clients for that host; do not end customer meetings from here.`,
                );
              }
              if (staleHostToken && hostRecoveryRef.current < 2) {
                hostRecoveryRef.current += 1;
                console.warn(
                  "[zoom] Host ZAK rejected — refreshing host session (no participant fallback)",
                  detail,
                );
                setNotice("Host Zoom token was rejected. Opening the classroom again as host.");
                liveMeetingRef.current = false;
                joinedKeyRef.current = null;
                setSession(null);
                setPhase("loading");
                setAttempt((value) => value + 1);
                return;
              }
              throw hostError;
            }
            throw hostError;
          }
          if (cancelled) {
            void connected.catch(() => undefined);
            return;
          }
          // join() resolving is NOT proof the media UI is live — wait for Connected.
          await connected;
          if (cancelled) return;
          grantZoomFrameMedia();
          joinedKeyRef.current = sessionJoinKey;
          liveMeetingRef.current = true;
          setPhase("sdk");
          setNotice("Live Zoom is running inside AviatorPass");
          console.info("[zoom] Meeting SDK 6.2.0 Connected inside AviatorPass", {
            meeting: active.meetingNumber,
            key: sessionJoinKey,
          });
          return;
        } catch (error) {
          if (cancelled) return;
          console.error("[zoom] Meeting SDK join failed; staying on AviatorPass", error);
          const failedClient = sdkRef.current;
          sdkRef.current = null;
          liveMeetingRef.current = false;
          joinedKeyRef.current = null;
          await releaseZoomEmbeddedClient(failedClient);
          if (stageRef.current) stageRef.current.replaceChildren();
          setPhase("error");
          await startLocalMedia();
          if (!cancelled) {
            const detail = zoomFailureText(error);
            // Meeting ID is rendered once below the notice — do not embed it here.
            setNotice(
              /3099|registration/i.test(detail)
                ? "This meeting still asks for registration. Open the classroom again."
                : /3000|other meetings in progress/i.test(detail)
                  ? "Zoom Error 3000 — Already has other meetings in progress. AviatorPass released only this classroom meeting once and kept you as host. If it persists, another live Zoom session is holding the platform host, or Server-to-Server cannot list live meetings (meeting:read). Leave other Zoom clients for that host; customer meetings are not ended here."
                  : /3712|signature is invalid/i.test(detail)
                    ? "Zoom error 3712 — Meeting SDK signature rejected. Super Admin: open /api/zoom/status and fix ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET as a matching pair from the Meeting SDK General app (Features → Embed on). Do not change Instructor OAuth (ZOOM_INSTRUCTOR_*)."
                    : /200|start meeting via tokens|\bzak\b/i.test(detail)
                      ? "Zoom error 200 — host token (ZAK) was rejected. Open the classroom again so AviatorPass can refresh the host session. Do not connect ceo@aviatorpass.com on the instructor profile."
                      : `The classroom could not open the meeting (${detail || "unknown Zoom error"}).`,
            );
          }
          return;
        }
      }
      setPhase("classroom");
      await startLocalMedia();
      if (!cancelled) {
        setNotice("You are in the AviatorPass classroom. The meeting stays on this page.");
      }
    }

    void enter();
    return () => {
      cancelled = true;
      // Unmount or meeting-identity change only (signature remints no longer change
      // sessionJoinKey). Leave once; same-key early return covers soft re-entries.
      const client = sdkRef.current;
      sdkRef.current = null;
      liveMeetingRef.current = false;
      joinedKeyRef.current = null;
      void releaseZoomEmbeddedClient(client);
      stopLocalMedia();
    };
  }, [sessionJoinKey, isHost, liveClassId, startLocalMedia, stopLocalMedia]);

  function toggleCamera() {
    const next = !camOn;
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCamOn(next);
  }

  function toggleMic() {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }

  async function leaveClassroom() {
    liveMeetingRef.current = false;
    joinedKeyRef.current = null;
    sdkRef.current = null;
    await releaseZoomEmbeddedClient();
    stopLocalMedia();
    if (onLeave) {
      onLeave();
      return;
    }
    if (leaveHref) {
      router.push(leaveHref);
      return;
    }
    router.back();
  }

  const shownMeeting = session?.meetingNumber || meetingNumber || "";
  const liveZoom = phase === "sdk";
  // Hide local preview while Zoom Component View is joining — overlaying the
  // stage during Connecting left a black pane over the SDK UI.
  const showPreview = phase === "classroom" || phase === "error";
  const joiningSdk = phase === "loading" && Boolean(session?.mode === "sdk");
  const personName =
    displayName?.trim() ||
    (session?.userName && !/^host$/i.test(session.userName) ? session.userName : "") ||
    (isHost ? "Instructor" : "Student");
  const hostLabel = instructorName?.trim() || (isHost ? personName : "Instructor");
  const sameAsHost = hostLabel.trim().toLowerCase() === personName.trim().toLowerCase();
  const railPeople = sameAsHost
    ? [{ name: hostLabel, host: true }]
    : [
        { name: hostLabel, host: true },
        { name: personName, host: false },
      ];
  const participantCount = railPeople.length;

  return (
    <div
      className={cn("classroom-stage text-white", liveZoom && "is-live", className)}
      style={{
        width: "100%",
        height: "100%",
        flex: "1 1 auto",
        minHeight: 0,
        color: "#fff",
      }}
    >
      <header className="classroom-chrome" aria-hidden>
        <p>{title}</p>
        <span className="classroom-chip">
          {liveZoom ? "In the meeting" : phase === "error" ? "Reconnect" : "Ready"}
        </span>
      </header>

      <div className="classroom-stage-main">
        <div className="classroom-viewport">
          <div
            ref={stageRef}
            className={cn("classroom-sdk-root", liveZoom && "is-live", joiningSdk && "is-joining")}
            aria-hidden={!liveZoom && !joiningSdk}
          />
          {showPreview ? (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={cn("classroom-preview", !camOn && "is-off")}
              />
              {!camOn ? (
                <div className="classroom-preview-fallback">
                  <VideoOff className="size-8 text-[#CCA04C]" />
                  <p>Camera is off</p>
                </div>
              ) : null}
              <div className="classroom-nameplate" data-host={isHost || undefined}>
                {personName}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <aside className="classroom-rail" aria-label="Participants">
        <div className="classroom-rail-head">
          <h2>Participants ({participantCount})</h2>
          <button type="button" className="classroom-invite">
            Invite
          </button>
        </div>
        <div className="classroom-rail-list">
          {railPeople.map((person) => (
            <div
              key={`${person.host ? "host" : "self"}-${person.name}`}
              className="classroom-tile"
              aria-label={person.host ? `${person.name} host` : person.name}
            >
              <div className="classroom-tile-avatar">{initialsOf(person.name)}</div>
              <div className="classroom-tile-label">
                <span className="truncate">{person.name}</span>
                {person.host ? (
                  <span className="classroom-tile-host">Host</span>
                ) : !micOn ? (
                  <MicOff className="size-3.5 text-[#fda4af]" aria-hidden />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="classroom-footer">
        {phase === "error" ? (
          <div className="classroom-notice" role="status">
            <Shield className="mt-0.5 size-4 shrink-0 text-[#CCA04C]" />
            <div className="min-w-0">
              <p>{notice}</p>
              {shownMeeting ? <p className="mt-1 opacity-70">Meeting ID {shownMeeting}</p> : null}
              {showPreview ? (
                <p className="mt-1 opacity-70">Camera preview only — Zoom is not connected yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={cn("classroom-dock", liveZoom && "is-live-sdk")}>
          {/*
            When Meeting SDK is live, Zoom’s toolbar owns mute/video/share/chat/participants.
            Preview dock only toggles local camera/mic before join — no fake Zoom duplicates.
          */}
          {!liveZoom ? (
            <div className="classroom-dock-cluster">
              <button
                type="button"
                className="classroom-dock-btn"
                data-off={!micOn || undefined}
                aria-label={micOn ? "Mute" : "Unmute"}
                onClick={toggleMic}
              >
                {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                <span>{micOn ? "Mute" : "Unmute"}</span>
              </button>
              <button
                type="button"
                className="classroom-dock-btn"
                data-off={!camOn || undefined}
                aria-label={camOn ? "Stop Video" : "Start Video"}
                onClick={toggleCamera}
              >
                {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
                <span>{camOn ? "Stop Video" : "Start Video"}</span>
              </button>
            </div>
          ) : null}

          <div className="classroom-dock-actions">
            {phase === "error" ? (
              <button
                type="button"
                className="classroom-dock-btn"
                data-reconnect="true"
                onClick={() => {
                  liveMeetingRef.current = false;
                  joinedKeyRef.current = null;
                  setNotice("Opening the classroom again");
                  setPhase("loading");
                  setSession(null);
                  setAttempt((value) => value + 1);
                }}
              >
                Open classroom again
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
        </div>
      </div>
    </div>
  );
}

export { InAppZoomRoom };
