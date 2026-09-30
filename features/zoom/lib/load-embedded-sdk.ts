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
    zak?: string;
  }) => Promise<void>;
  leave?: () => Promise<void>;
}

interface ZoomEmbeddedFactory {
  createClient: () => ZoomEmbeddedClient;
}

const SDK_SRC = "https://source.zoom.us/3.13.2/zoom-meeting-embedded-3.13.2.min.js";

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedFactory;
  }
}

export async function loadZoomEmbeddedClient(): Promise<ZoomEmbeddedClient> {
  if (typeof window === "undefined") {
    throw new Error("Zoom Meeting SDK is browser-only");
  }
  if (!window.ZoomMtgEmbedded) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Zoom SDK failed to load")), {
          once: true,
        });
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Zoom SDK failed to load"));
      document.head.appendChild(script);
    });
  }
  const factory = window.ZoomMtgEmbedded;
  if (!factory) throw new Error("Zoom Meeting SDK is unavailable");
  return factory.createClient();
}
