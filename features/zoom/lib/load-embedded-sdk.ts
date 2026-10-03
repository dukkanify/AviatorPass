export interface ZoomEmbeddedClient {
  init: (opts: {
    zoomAppRoot: HTMLElement;
    language?: string;
    patchJsMedia?: boolean;
    leaveOnPageUnload?: boolean;
  }) => Promise<void>;
  join: (opts: {
    signature: string;
    meetingNumber: string;
    password?: string;
    userName: string;
    userEmail?: string;
    tk?: string;
    zak?: string;
  }) => Promise<void>;
  leave?: () => Promise<void>;
}

interface ZoomEmbeddedFactory {
  createClient: () => ZoomEmbeddedClient;
}

export const ZOOM_EMBEDDED_SDK_VERSION = "6.2.0";
const ZOOM_SDK_VERSION = ZOOM_EMBEDDED_SDK_VERSION;
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;

/** Independent vendor scripts load together, then dependents, then the Meeting SDK. */
export const ZOOM_EMBEDDED_SDK_LOAD_GROUPS = [
  [
    `${ZOOM_CDN}/lib/vendor/react.min.js`,
    `${ZOOM_CDN}/lib/vendor/redux.min.js`,
    `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
  ],
  [`${ZOOM_CDN}/lib/vendor/react-dom.min.js`, `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`],
  [`${ZOOM_CDN}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`],
] as const;

export const ZOOM_EMBEDDED_SDK_SCRIPTS = ZOOM_EMBEDDED_SDK_LOAD_GROUPS.flat();

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedFactory;
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

export function prefetchZoomEmbeddedSdk(): void {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[rel="preconnect"][href="https://source.zoom.us"]')) {
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://source.zoom.us";
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);
  }
  for (const src of ZOOM_EMBEDDED_SDK_SCRIPTS) {
    if (document.querySelector(`link[rel="preload"][href="${src}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "script";
    link.href = src;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

export async function loadZoomEmbeddedClient(): Promise<ZoomEmbeddedClient> {
  if (typeof window === "undefined") {
    throw new Error("Zoom Meeting SDK is browser-only");
  }
  if (!window.ZoomMtgEmbedded) {
    for (const group of ZOOM_EMBEDDED_SDK_LOAD_GROUPS) {
      await Promise.all(group.map((src) => loadScript(src)));
    }
  }
  const factory = window.ZoomMtgEmbedded;
  if (!factory) throw new Error("Zoom Meeting SDK is unavailable");
  return factory.createClient();
}
