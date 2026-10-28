"use client";

import "@/styles/classroom.css";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Shield, Video, VideoOff } from "lucide-react";

import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
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
  return {
    isResizable: false,
    defaultViewType: narrow ? ("gallery" as const) : ("speaker" as const),
    viewSizes: {
      default: videoSize,
      ribbon: narrow
        ? {
            width: videoSize.width,
            height: Math.max(140, Math.round(videoSize.height * 0.34)),
          }
        : {
            width: Math.min(320, Math.round(videoSize.width / 4)),
            height: videoSize.height,
          },
    },
    popper: {
      disableDraggable: true,
      anchorElement: stage,
      placement: narrow ? "top" : "innerCenter",
    },
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

function menuText(node: HTMLElement) {
  return (node.innerText || "").replace(/\s+/g, " ").slice(0, 280);
}

function isClippedZoomMenu(node: HTMLElement) {
  if (node.closest(".classroom-chrome, .classroom-footer, .classroom-dock")) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width < 96 || rect.height < 48) return false;
  if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.7) return false;
  const clipped =
    rect.left < 8 ||
    rect.top < 8 ||
    rect.right > window.innerWidth - 8 ||
    rect.bottom > window.innerHeight - 8;
  if (!clipped && node.dataset.aviatorZoomPopup !== "true") return false;
  if (isZoomPopup(node)) return true;
  return /select a|microphone|speaker|camera|share|who can share|leave|iphone|airpod|macbook|default/i.test(
    menuText(node),
  );
}

function placeZoomPopup(node: HTMLElement) {
  if (!isClippedZoomMenu(node)) return;
  const parentMenu = node.parentElement?.closest<HTMLElement>(
    "[role='menu'], [role='dialog'], [role='listbox'], [data-aviator-zoom-popup]",
  );
  if (parentMenu && parentMenu !== node) return;
  const rect = node.getBoundingClientRect();
  let host: HTMLElement | null = node.parentElement;
  while (host && host !== document.documentElement) {
    const transform = window.getComputedStyle(host).transform;
    if (transform && transform !== "none") {
      document.body.appendChild(node);
      break;
    }
    host = host.parentElement;
  }
  const margin = 12;
  const width = Math.min(Math.max(rect.width, 260), window.innerWidth - margin * 2);
  const height = Math.min(Math.max(rect.height, 160), window.innerHeight - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  const top = Math.min(Math.max(margin, rect.top), window.innerHeight - height - margin);
  const set = (prop: string, value: string) => node.style.setProperty(prop, value, "important");
  set("position", "fixed");
  set("z-index", "10000");
  set("box-sizing", "border-box");
  set("inset", "auto");
  set("left", `${Math.round(Math.max(margin, left))}px`);
  set("top", `${Math.round(Math.max(margin, top))}px`);
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
  root.querySelectorAll<HTMLElement>("div").forEach((node) => {
    if (isZoomPopup(node) || node.dataset.aviatorZoomPopup === "true") return;
    if (node.closest("[data-aviator-zoom-popup]")) return;
    const rect = node.getBoundingClientRect();
    const fillsWidth = rect.width >= box.width * 0.92;
    const fillsHeight = rect.height >= box.height * 0.75;
    if (fillsWidth && fillsHeight) return;
    if (rect.width < 180 || rect.height < 180) return;
    if (node.querySelectorAll("button").length < 3) return;
    fillZoomSurface(node);
  });
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
      "[role='menu'], [role='listbox'], [role='dialog'], [class*='meeting-info'], [class*='meetingInfo'], [class*='MuiMenu'], [class*='MuiPopover'], [class*='MuiModal'], [class*='MuiDrawer'], [class*='share-menu'], [class*='ShareMenu'], [class*='popup'], [class*='menu'], [class*='Menu'], [class*='popover'], [class*='Popover'], [class*='dropdown'], [class*='Dropdown']",
    )
    .forEach(placeZoomPopup);
  grantZoomFrameMedia();
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

  React.useEffect(() => {
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
      setSession(result.data);
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // `attempt` forces a fresh signature/ZAK mint when the user taps reconnect.
  }, [attempt, isHost, joinUrl, liveClassId, meetingNumber, password, providerMode, startUrl]);

  React.useEffect(() => {
    if (!session) return;
    const active = session;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    async function enter() {
      if (active.mode === "sdk" && active.signature && active.meetingNumber && stageRef.current) {
        try {
          let client = await openZoomEmbeddedClient();
          if (cancelled) {
            await releaseZoomEmbeddedClient(client);
            return;
          }
          const stage = stageRef.current;
          if (!stage) return;
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
          const participantJoin = {
            signature: active.signature,
            meetingNumber: active.meetingNumber,
            password: active.password,
            userName: active.userName,
            userEmail: active.userEmail,
            tk: "",
          };
          try {
            await joinEmbeddedMeeting(
              client,
              {
                ...participantJoin,
                signature: active.hostSignature || active.signature,
                zak: active.zak || undefined,
              },
              stage,
            );
          } catch (hostError) {
            if (!active.zak && !active.hostSignature) throw hostError;
            const detail = zoomFailureText(hostError);
            // Signature failures are credential/JWT issues — retrying as participant
            // with the same Meeting SDK secret will fail the same way.
            if (/3712|signature is invalid/i.test(detail)) throw hostError;
            const staleHostToken = /(?:^|\D)200(?:\D|$)|start meeting via tokens|\bzak\b/i.test(
              detail,
            );
            const hostBusy = /3000|other meetings in progress/i.test(detail);
            if (!staleHostToken && !hostBusy) throw hostError;

            const remount = async () => {
              await releaseZoomEmbeddedClient(client);
              stage.replaceChildren();
              client = await openZoomEmbeddedClient();
              if (cancelled) {
                await releaseZoomEmbeddedClient(client);
                return false;
              }
              sdkRef.current = client;
              await initClient(client);
              return true;
            };

            // 1) start_url ZAK rejected → retry host JWT (role 1) without zak
            if (staleHostToken && active.hostSignature) {
              console.warn("[zoom] Host ZAK rejected; joining with General App JWT only", detail);
              if (!(await remount())) return;
              try {
                await joinEmbeddedMeeting(
                  client,
                  { ...participantJoin, signature: active.hostSignature },
                  stage,
                );
              } catch (hostOnlyError) {
                const hostOnlyDetail = zoomFailureText(hostOnlyError);
                if (/3712|signature is invalid/i.test(hostOnlyDetail)) throw hostOnlyError;
                // Role-1 without a Zoom-accepted ZAK still returns 200 on this account.
                // Fall through to participant JWT so the instructor can enter the room.
                console.warn(
                  "[zoom] Host JWT without ZAK rejected; joining as participant",
                  hostOnlyDetail,
                );
                if (!(await remount())) return;
                await joinEmbeddedMeeting(client, participantJoin, stage);
              }
            } else {
              // 2) Host already in another meeting → participant JWT only
              console.warn("[zoom] Host already in another meeting; joining as participant");
              if (!(await remount())) return;
              await joinEmbeddedMeeting(client, participantJoin, stage);
            }
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
                const next = zoomVideoOptions(stageRef.current);
                void client.updateVideoOptions?.({
                  defaultViewType: next.defaultViewType,
                  viewSizes: next.viewSizes,
                  popper: next.popper,
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
          setPhase("error");
          await startLocalMedia();
          if (!cancelled) {
            const detail = zoomFailureText(error);
            // Meeting ID is rendered once below the notice — do not embed it here.
            setNotice(
              /3099|registration/i.test(detail)
                ? "This meeting still asks for registration. Open the classroom again."
                : /3000|other meetings in progress/i.test(detail)
                  ? "Zoom error 3000 — this Zoom host account is already inside another meeting. Leave that meeting in the Zoom app or web client, then open this classroom again. AviatorPass does not end your other Zoom meetings automatically."
                  : /3712|signature is invalid/i.test(detail)
                    ? "Zoom error 3712 — Meeting SDK signature rejected. Super Admin: open /api/zoom/status and fix ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET as a matching pair from the Meeting SDK General app (Features → Embed on). Do not change Instructor OAuth (ZOOM_INSTRUCTOR_*)."
                    : /200|start meeting via tokens|\bzak\b/i.test(detail)
                      ? "Zoom error 200 — host token (ZAK) was rejected. Reconnect your personal Zoom account on the instructor profile, then open the classroom again."
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
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      const client = sdkRef.current;
      sdkRef.current = null;
      void releaseZoomEmbeddedClient(client);
      stopLocalMedia();
    };
  }, [attempt, session, startLocalMedia, stopLocalMedia]);

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
  const liveZoom = phase === "sdk";
  const showPreview = !liveZoom;
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
            className={cn("classroom-sdk-root", liveZoom && "is-live")}
            aria-hidden={!liveZoom}
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
