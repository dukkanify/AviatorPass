"use client";

import "@/styles/classroom.css";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Radio, Shield, Video, VideoOff } from "lucide-react";

import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import {
  openZoomEmbeddedClient,
  prefetchZoomEmbeddedSdk,
  releaseZoomEmbeddedClient,
  type ZoomEmbeddedClient,
} from "@/features/zoom/lib/load-embedded-sdk";
import { cn } from "@/lib/utils";

function stageVideoSize(el: HTMLElement): { width: number; height: number } {
  const box = el.getBoundingClientRect();
  const width = Math.round(box.width || el.clientWidth || 0);
  const height = Math.round(box.height || el.clientHeight || 0);
  return {
    width: Math.max(width, 480),
    height: Math.max(height, 320),
  };
}

const ZOOM_FLOAT_SELECTOR = [
  "[class*='suspension']",
  "[class*='zoom-ui']",
  "[class*='video-player']",
  "[class*='zm-video']",
  "[id*='zmmtg']",
  "[id*='zoom-ui']",
  "iframe[src*='zoom']",
].join(", ");

function zoomLabel(node: HTMLElement) {
  return `${node.id} ${typeof node.className === "string" ? node.className : ""} ${node.getAttribute("role") ?? ""}`;
}

function isZoomPopup(node: HTMLElement) {
  const label = zoomLabel(node);
  const role = node.getAttribute("role") ?? "";
  if (/suspension-view-tabpanel|video-player|zm-video/i.test(label)) return false;
  if (role === "menu" || role === "listbox" || role === "dialog") return true;
  return /meeting-info|meetingInfo|MuiMenu|MuiPopover|MuiModal|MuiDrawer|share-menu|ShareMenu|popup/i.test(
    label,
  );
}

function isZoomChrome(node: HTMLElement) {
  const label = zoomLabel(node);
  if (/meeting-info-icon|MeetingInfoIcon/i.test(label) && node.offsetWidth < 72) return false;
  return isZoomPopup(node);
}

function fillZoomSurface(node: HTMLElement) {
  const set = (prop: string, value: string) => node.style.setProperty(prop, value, "important");
  set("position", "absolute");
  set("inset", "0");
  set("width", "100%");
  set("height", "100%");
  set("max-width", "100%");
  set("max-height", "100%");
  set("transform", "none");
  set("margin", "0");
}

function placeZoomPopup(node: HTMLElement) {
  if (!isZoomPopup(node)) return;
  const parent = node.parentElement?.closest<HTMLElement>(
    "[role='menu'], [role='dialog'], [role='listbox']",
  );
  if (parent && parent !== node) return;
  const rect = node.getBoundingClientRect();
  if (rect.width < 72 || rect.height < 36) return;
  if (rect.width > window.innerWidth * 0.85 && rect.height > window.innerHeight * 0.7) return;
  const margin = 12;
  const outside =
    rect.left < margin ||
    rect.top < margin ||
    rect.right > window.innerWidth - margin ||
    rect.bottom > window.innerHeight - margin;
  if (!outside) return;
  const width = Math.min(Math.max(rect.width, 240), window.innerWidth - margin * 2);
  const height = Math.min(Math.max(rect.height, 120), window.innerHeight - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  const top = Math.min(Math.max(margin, rect.top), window.innerHeight - height - margin);
  const set = (prop: string, value: string) => node.style.setProperty(prop, value, "important");
  set("position", "fixed");
  set("z-index", "200");
  set("box-sizing", "border-box");
  set("inset", "auto");
  set("left", `${Math.round(left)}px`);
  set("top", `${Math.round(top)}px`);
  set("width", `${Math.round(width)}px`);
  set("max-width", "calc(100vw - 24px)");
  set("height", "auto");
  set("max-height", `${Math.round(height)}px`);
  set("overflow", "auto");
  set("transform", "none");
  node.dataset.aviatorZoomPopup = "true";
}

function expandMeetingSurface(stage: HTMLElement) {
  const root = stage.querySelector<HTMLElement>(".classroom-sdk-root");
  if (!root) return;
  const box = root.getBoundingClientRect();
  if (box.width < 160 || box.height < 120) return;
  let node = root.firstElementChild;
  for (let depth = 0; node instanceof HTMLElement && depth < 5; depth += 1) {
    if (isZoomPopup(node)) break;
    const rect = node.getBoundingClientRect();
    if (rect.width > 80 && rect.width < box.width * 0.92) fillZoomSurface(node);
    const next = [...node.children].find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !isZoomPopup(child) &&
        child.getBoundingClientRect().width > 80,
    );
    node = next ?? null;
  }
}

function grantZoomFrameMedia() {
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

function pinZoomWindowToStage(stage: HTMLElement) {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 90) return;
  for (const child of stage.children) {
    if (child instanceof HTMLElement && !isZoomChrome(child)) fillZoomSurface(child);
  }
  const nodes = document.querySelectorAll<HTMLElement>(ZOOM_FLOAT_SELECTOR);
  for (const node of nodes) {
    if (isZoomChrome(node) || stage.contains(node)) continue;
    if (node.offsetWidth < 64 || node.offsetHeight < 64) continue;
    const set = (prop: string, value: string) => node.style.setProperty(prop, value, "important");
    set("position", "fixed");
    set("left", `${Math.round(rect.left)}px`);
    set("top", `${Math.round(rect.top)}px`);
    set("width", `${Math.round(rect.width)}px`);
    set("height", `${Math.round(rect.height)}px`);
    set("max-width", `${Math.round(rect.width)}px`);
    set("max-height", `${Math.round(rect.height)}px`);
    set("transform", "none");
    set("z-index", "6");
    set("margin", "0");
  }
  expandMeetingSurface(stage);
  document
    .querySelectorAll<HTMLElement>(
      "[role='menu'], [role='listbox'], [role='dialog'], [class*='meeting-info'], [class*='meetingInfo'], [class*='MuiMenu'], [class*='MuiPopover'], [class*='MuiModal'], [class*='MuiDrawer'], [class*='share-menu'], [class*='ShareMenu'], [class*='popup']",
    )
    .forEach(placeZoomPopup);
  grantZoomFrameMedia();
}

interface InAppZoomRoomProps {
  joinUrl: string;
  startUrl?: string | null;
  meetingNumber?: string | null;
  password?: string | null;
  isHost?: boolean;
  providerMode?: string | null;
  title?: string;
  leaveHref?: string;
  onLeave?: () => void;
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
  onLeave,
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
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    async function enter() {
      if (active.mode === "sdk" && active.signature && active.meetingNumber && stageRef.current) {
        try {
          const client = await openZoomEmbeddedClient();
          if (cancelled) {
            await releaseZoomEmbeddedClient(client);
            return;
          }
          sdkRef.current = client;
          const videoSize = stageVideoSize(stageRef.current);
          await client.init({
            zoomAppRoot: stageRef.current,
            language: "en-US",
            patchJsMedia: true,
            leaveOnPageUnload: true,
            customize: {
              video: {
                isResizable: false,
                viewSizes: {
                  default: videoSize,
                  ribbon: {
                    width: Math.min(320, Math.round(videoSize.width / 4)),
                    height: videoSize.height,
                  },
                },
                popper: {
                  disableDraggable: true,
                  anchorElement: stageRef.current,
                  placement: "innerCenter",
                },
              },
            },
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
            const anotherMeeting = /3000|other meetings in progress/i.test(detail);
            if (!anotherMeeting && (!staleHostToken || !joinOpts.zak)) throw hostError;
            if (staleHostToken) {
              console.warn("[zoom] Host ZAK rejected; joining with General App JWT only");
            }
            await client.leave?.().catch(() => undefined);
            await client.join({ ...joinOpts, zak: undefined });
          }
          if (cancelled) return;
          stopLocalMedia();
          setPhase("sdk");
          setNotice("Live Zoom is running inside AviatorPass");
          console.info("[zoom] Meeting SDK 6.2.0 joined inside AviatorPass");
          let fitQueued = false;
          let fitResize = false;
          const fit = (resize: boolean) => {
            fitResize = fitResize || resize;
            if (!stageRef.current || fitQueued) return;
            fitQueued = true;
            window.requestAnimationFrame(() => {
              fitQueued = false;
              const resizeNow = fitResize;
              fitResize = false;
              if (!stageRef.current) return;
              if (resizeNow) {
                const next = stageVideoSize(stageRef.current);
                void client.updateVideoOptions?.({
                  viewSizes: { default: next },
                  popper: {
                    disableDraggable: true,
                    anchorElement: stageRef.current,
                    placement: "innerCenter",
                  },
                });
              }
              pinZoomWindowToStage(stageRef.current);
            });
          };
          fit(true);
          window.setTimeout(() => fit(true), 200);
          window.setTimeout(() => fit(true), 800);
          resizeObserver = new ResizeObserver(() => fit(true));
          resizeObserver.observe(stageRef.current);
          mutationObserver = new MutationObserver(() => fit(false));
          mutationObserver.observe(document.body, { childList: true, subtree: true });
          return;
        } catch (error) {
          if (cancelled) return;
          console.error("[zoom] Meeting SDK join failed; staying on AviatorPass", error);
          const failedClient = sdkRef.current;
          sdkRef.current = null;
          await releaseZoomEmbeddedClient(failedClient);
          if (stageRef.current) stageRef.current.replaceChildren();
          setPhase("classroom");
          await startLocalMedia();
          if (!cancelled) {
            const detail = error instanceof Error ? error.message : String(error);
            setNotice(
              /3712|invalid sdk|sdk key/i.test(detail)
                ? "Zoom Meeting SDK rejected the General App credentials. Check ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET."
                : /3099|registration/i.test(detail)
                  ? "Zoom still asked for registration. AviatorPass is turning that off — open the classroom again."
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
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      const client = sdkRef.current;
      sdkRef.current = null;
      void releaseZoomEmbeddedClient(client);
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
  const shownPassword = session?.password || password || "";
  const liveZoom = phase === "sdk";
  const liveLabel = liveZoom
    ? "Live Zoom · inside AviatorPass"
    : "Live classroom · inside AviatorPass";
  const showPreview = !liveZoom;

  return (
    <div
      className={cn("classroom-stage text-white", liveZoom && "is-live", className)}
      style={{ width: "100%", minHeight: "min(72vh, 820px)", background: "#050b11" }}
    >
      <header className="classroom-chrome">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
            <Radio className="size-3 shrink-0 text-[#CCA04C]" />
            {liveLabel}
          </p>
        </div>
        <span className="classroom-chip shrink-0 text-[11px] uppercase tracking-[0.16em] text-white/70">
          {isHost ? "Host" : "Student"}
        </span>
      </header>

      <div
        className="classroom-viewport"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          minHeight: "min(58vh, 680px)",
          overflow: liveZoom ? "visible" : "hidden",
        }}
      >
        <div
          ref={stageRef}
          className={cn("classroom-sdk-root", liveZoom && "is-live")}
          aria-hidden={!liveZoom}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
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
          </>
        ) : null}
      </div>

      <div className="classroom-footer">
        <div className="classroom-caption">
          <Shield className="size-4 shrink-0 text-[#CCA04C]" />
          <div className="min-w-0">
            <p>{notice}</p>
            {shownMeeting ? (
              <p className="classroom-caption-meta">
                Meeting ID {shownMeeting}
                {shownPassword ? ` · Passcode ${shownPassword}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <div className="classroom-dock">
          {showPreview ? (
            <>
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
            </>
          ) : null}
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
    </div>
  );
}

export { InAppZoomRoom };
