/**
 * Zoom Meeting SDK for Web — Client View (ZoomMtg).
 * Same release line as Component View embedded (6.2.0).
 * @see https://developers.zoom.us/docs/meeting-sdk/web/client-view/
 */

export const ZOOM_CLIENT_VIEW_SDK_VERSION = "6.2.0";
const ZOOM_SDK_VERSION = ZOOM_CLIENT_VIEW_SDK_VERSION;
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;

/** Vendors + Client View bundle (not the embedded Component View script). */
export const ZOOM_CLIENT_VIEW_LOAD_GROUPS = [
  [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux.min.js`,
    `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
  ],
  [
    `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
    `${ZOOM_CDN}/lib/vendor/react-redux.min.js`,
  ],
  [`${ZOOM_CDN}/zoom-meeting-${ZOOM_SDK_VERSION}.min.js`],
] as const;

export const ZOOM_CLIENT_VIEW_SDK_SCRIPTS = ZOOM_CLIENT_VIEW_LOAD_GROUPS.flat();

export interface ZoomClientViewJoinPayload {
  signature: string;
  meetingNumber: string;
  passWord: string;
  userName: string;
  userEmail?: string;
  tk?: string;
  zak?: string;
}

export interface ZoomMtgClient {
  setZoomJSLib: (path: string, dir: string) => void;
  preLoadWasm: () => void;
  prepareWebSDK: () => void;
  init: (opts: {
    leaveUrl: string;
    patchJsMedia?: boolean;
    disableCORP?: boolean;
    success?: (result: unknown) => void;
    error?: (error: unknown) => void;
  }) => void;
  join: (
    opts: ZoomClientViewJoinPayload & {
      success?: (result: unknown) => void;
      error?: (error: unknown) => void;
    },
  ) => void;
  leaveMeeting: (opts?: {
    confirm?: boolean;
    success?: (result: unknown) => void;
    error?: (error: unknown) => void;
    cancelCallback?: () => void;
  }) => void;
  inMeetingServiceListener?: (event: string, callback: (data: unknown) => void) => void;
}

declare global {
  interface Window {
    ZoomMtg?: ZoomMtgClient;
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === "1" || existing.getAttribute("data-loaded") === "1") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function prefetchZoomClientViewSdk(): void {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[rel="preconnect"][href="https://source.zoom.us"]')) {
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://source.zoom.us";
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);
  }
  for (const src of ZOOM_CLIENT_VIEW_SDK_SCRIPTS) {
    if (document.querySelector(`link[rel="preload"][href="${src}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "script";
    link.href = src;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

let prepared = false;

export async function loadZoomClientView(): Promise<ZoomMtgClient> {
  if (typeof window === "undefined") {
    throw new Error("Zoom Meeting SDK Client View is browser-only");
  }
  if (!window.ZoomMtg) {
    for (const group of ZOOM_CLIENT_VIEW_LOAD_GROUPS) {
      await Promise.all(group.map((src) => loadScript(src)));
    }
  }
  const mtg = window.ZoomMtg;
  if (!mtg) throw new Error("Zoom Meeting SDK Client View is unavailable");
  if (!prepared) {
    mtg.setZoomJSLib(`${ZOOM_CDN}/lib`, "/av");
    mtg.preLoadWasm();
    mtg.prepareWebSDK();
    prepared = true;
  }
  return mtg;
}

function clientViewFailureText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const row = error as {
      reason?: unknown;
      errorCode?: unknown;
      message?: unknown;
      type?: unknown;
    };
    return [row.errorCode, row.reason, row.message, row.type]
      .filter((part) => part != null && part !== "")
      .join(" ");
  }
  return String(error ?? "unknown Client View error");
}

function asPromise(
  run: (handlers: { success: (v: unknown) => void; error: (e: unknown) => void }) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    run({
      success: (value) => resolve(value),
      error: (error) =>
        reject(error instanceof Error ? error : new Error(clientViewFailureText(error))),
    });
  });
}

/** Client View paints into #zmmtg-root — create it if the page shell omitted it. */
export function ensureZoomClientViewRoot(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("Zoom Client View root requires document");
  }
  let root = document.getElementById("zmmtg-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "zmmtg-root";
    document.body.prepend(root);
  }
  let aria = document.getElementById("aria-notify-area");
  if (!aria) {
    aria = document.createElement("div");
    aria.id = "aria-notify-area";
    aria.setAttribute("aria-live", "assertive");
    document.body.appendChild(aria);
  }
  return root;
}

export async function initZoomClientViewMeeting(
  mtg: ZoomMtgClient,
  opts: { leaveUrl: string },
): Promise<void> {
  ensureZoomClientViewRoot();
  await asPromise((handlers) => {
    mtg.init({
      leaveUrl: opts.leaveUrl,
      patchJsMedia: true,
      disableCORP: typeof window !== "undefined" ? !window.crossOriginIsolated : true,
      success: handlers.success,
      error: handlers.error,
    });
  });
}

export async function joinZoomClientViewMeeting(
  mtg: ZoomMtgClient,
  payload: ZoomClientViewJoinPayload,
): Promise<void> {
  await asPromise((handlers) => {
    mtg.join({
      ...payload,
      success: handlers.success,
      error: handlers.error,
    });
  });
}

export function leaveZoomClientViewMeeting(mtg: ZoomMtgClient, confirm = false): Promise<void> {
  return asPromise((handlers) => {
    mtg.leaveMeeting({
      confirm,
      success: handlers.success,
      error: handlers.error,
    });
  }).then(() => undefined);
}
