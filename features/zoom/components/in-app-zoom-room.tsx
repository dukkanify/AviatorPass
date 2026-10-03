"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Radio, Shield, Video, VideoOff } from "lucide-react";

import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import {
  loadZoomEmbeddedClient,
  prefetchZoomEmbeddedSdk,
  type ZoomEmbeddedClient,
} from "@/features/zoom/lib/load-embedded-sdk";
import { cn } from "@/lib/utils";

interface InAppZoomRoomProps {
  joinUrl: string;
  startUrl?: string | null;
  meetingNumber?: string | null;
  password?: string | null;
  isHost?: boolean;
  providerMode?: string | null;
  title?: string;
  leaveHref?: string;
  className?: string;
}

interface InAppSession {
  mode: "sdk" | "classroom";
  meetingNumber: string;
  password: string;
  userName: string;
  userEmail: string;
  signature: string | null;
  zak: string | null;
  role: 0 | 1;
}

function InAppZoomRoom({
  joinUrl,
  startUrl,
  meetingNumber,
  password,
  isHost = false,
  providerMode = null,
  title = "Live class",
  leaveHref = routes.dashboard,
  className,
}: InAppZoomRoomProps) {
  const router = useRouter();
  const stageRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const sdkRef = React.useRef<ZoomEmbeddedClient | null>(null);
  const [session, setSession] = React.useState<InAppSession | null>(null);
  const [phase, setPhase] = React.useState<"loading" | "classroom" | "sdk" | "error">("loading");
  const [notice, setNotice] = React.useState("Preparing the AviatorPass classroom");
  const [camOn, setCamOn] = React.useState(true);
  const [micOn, setMicOn] = React.useState(true);

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
      const result = await authFetch<InAppSession>("/api/zoom/in-app-session", {
        method: "POST",
        body: JSON.stringify({
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
        setNotice(result.error ?? "Classroom is ready inside AviatorPass.");
        setSession({
          mode: "classroom",
          meetingNumber: meetingNumber ?? "",
          password: password ?? "",
          userName: "AviatorPass student",
          userEmail: "",
          signature: null,
          zak: null,
          role: isHost ? 1 : 0,
        });
        return;
      }
      if (result.data.mode === "sdk") prefetchZoomEmbeddedSdk();
      setSession(result.data);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [isHost, joinUrl, meetingNumber, password, providerMode, startUrl]);

  React.useEffect(() => {
    if (!session) return;
    const active = session;
    let cancelled = false;

    async function enter() {
      if (active.mode === "sdk" && active.signature && active.meetingNumber && stageRef.current) {
        try {
          const client = await loadZoomEmbeddedClient();
          if (cancelled) return;
          sdkRef.current = client;
          await client.init({
            zoomAppRoot: stageRef.current,
            language: "en-US",
            patchJsMedia: true,
            leaveOnPageUnload: true,
          });
          const joinOpts = {
            signature: active.signature,
            meetingNumber: active.meetingNumber,
            password: active.password,
            userName: active.userName,
            userEmail: active.userEmail,
            tk: "",
            zak: active.zak || undefined,
          };
          try {
            await client.join(joinOpts);
          } catch (hostError) {
            const detail =
              hostError instanceof Error ? hostError.message : JSON.stringify(hostError ?? {});
            const staleHostToken = /200|start meeting via tokens|zak/i.test(detail);
            if (!staleHostToken || !joinOpts.zak) throw hostError;
            console.warn("[zoom] Host ZAK rejected; joining with General App JWT only");
            await client.leave?.().catch(() => undefined);
            await client.join({ ...joinOpts, zak: undefined });
          }
          if (cancelled) return;
          stopLocalMedia();
          setPhase("sdk");
          setNotice("Live Zoom is running inside AviatorPass");
          console.info("[zoom] Meeting SDK 6.2.0 joined inside AviatorPass");
          return;
        } catch (error) {
          if (cancelled) return;
          console.error("[zoom] Meeting SDK join failed; staying on AviatorPass", error);
          await sdkRef.current?.leave?.().catch(() => undefined);
          sdkRef.current = null;
          if (stageRef.current) stageRef.current.replaceChildren();
          setPhase("classroom");
          await startLocalMedia();
          if (!cancelled) {
            const detail = error instanceof Error ? error.message : String(error);
            setNotice(
              /3712|invalid sdk|sdk key/i.test(detail)
                ? "Zoom Meeting SDK rejected the General App credentials. Check ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET."
                : "Zoom could not join inside AviatorPass. The classroom stays on this page.",
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
      void sdkRef.current?.leave?.().catch(() => undefined);
      sdkRef.current = null;
      stopLocalMedia();
    };
  }, [session, startLocalMedia, stopLocalMedia]);

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
    await sdkRef.current?.leave?.().catch(() => undefined);
    stopLocalMedia();
    if (leaveHref) {
      router.push(leaveHref);
      return;
    }
    router.back();
  }

  const shownMeeting = session?.meetingNumber || meetingNumber || "";
  const shownPassword = session?.password || password || "";
  const liveLabel =
    phase === "sdk" ? "Live Zoom · inside AviatorPass" : "Live classroom · inside AviatorPass";

  return (
    <div className={cn("classroom-stage text-white", className)}>
      <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 py-4 sm:px-5">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
            <Radio className="size-3 text-[#CCA04C]" />
            {liveLabel}
          </p>
        </div>
        <span className="classroom-chip text-[11px] uppercase tracking-[0.16em] text-white/70">
          {isHost ? "Host" : "Student"}
        </span>
      </div>

      <div className="relative min-h-[min(72vh,760px)] bg-black">
        <div ref={stageRef} className="absolute inset-0" />
        {phase !== "sdk" ? (
          <div className="absolute inset-0 flex flex-col">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071018] via-transparent to-black/35" />
            <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-2 px-6 text-center">
              <Shield className="size-6 text-[#CCA04C]" />
              <p className="max-w-lg text-sm text-white/80">{notice}</p>
              {shownMeeting ? (
                <p className="font-mono text-[11px] text-white/50">
                  Meeting ID {shownMeeting}
                  {shownPassword ? ` · Passcode ${shownPassword}` : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {phase !== "sdk" ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-[#071018] via-[#071018]/70 to-transparent px-4 pb-5 pt-16">
          <div className="classroom-dock">
            <button
              type="button"
              className="classroom-dock-btn"
              data-off={!micOn || undefined}
              aria-label={micOn ? "Mute" : "Unmute"}
              onClick={toggleMic}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <button
              type="button"
              className="classroom-dock-btn"
              data-off={!camOn || undefined}
              aria-label={camOn ? "Camera off" : "Camera on"}
              onClick={toggleCamera}
            >
              {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </button>
            <button
              type="button"
              className="classroom-dock-btn"
              data-leave="true"
              onClick={() => void leaveClassroom()}
            >
              <PhoneOff className="size-4" />
              Leave classroom
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { InAppZoomRoom };
