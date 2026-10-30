/**
 * Meeting SDK Component View connection helpers.
 * "In the meeting" / phase=sdk must wait for connection-change Connected —
 * join() resolving alone is not proof the media UI left "Connecting".
 */

export type ZoomConnectionListener = {
  on?: (event: string, callback: (payload: unknown) => void) => void;
  off?: (event: string, callback: (payload: unknown) => void) => void;
};

export function zoomConnectionStateOf(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("state" in payload)) return "";
  return String((payload as { state?: unknown }).state ?? "").trim();
}

export function isZoomConnectionConnected(state: string): boolean {
  return /^connected$/i.test(state.trim());
}

export function isZoomConnectionTerminalFailure(state: string): boolean {
  return /^(closed|fail|failed)$/i.test(state.trim());
}

/** True when Zoom Component View still paints its Connecting overlay inside the stage. */
export function stageShowsZoomConnecting(stage: HTMLElement | null | undefined): boolean {
  if (!stage) return false;
  const text = (stage.innerText || stage.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  // Zoom's own overlay uses "Connecting..." — do not match unrelated copy outside stage.
  return /\bConnecting(?:\.\.\.)?\b/i.test(text);
}

/**
 * After connection-change Connected, wait until Zoom's Connecting overlay is gone
 * (or a Zoom app container is painted without Connecting). Rejects on timeout.
 */
export function waitForEmbeddedUiLeftConnecting(
  stage: HTMLElement,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 45000;
  const pollMs = options?.pollMs ?? 250;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const hasZoomApp = Boolean(
        stage.querySelector(
          '[aria-label="Zoom app container"], [aria-label="Zoom Web SDK Widget"]',
        ),
      );
      const connecting = stageShowsZoomConnecting(stage);
      if (hasZoomApp && !connecting) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(
          new Error(
            connecting
              ? "Zoom media UI stayed on Connecting after Connected"
              : "Zoom media UI did not paint after Connected",
          ),
        );
        return;
      }
      globalThis.setTimeout(tick, pollMs);
    };
    tick();
  });
}

/**
 * Subscribe before join() so a Connected event during join is not missed.
 * Resolves on Connected; rejects on Closed/Fail, missing event API, or timeout.
 * Never falsifies Connected when client.on is unavailable (that left shell
 * "In the meeting" over a stuck Connecting overlay).
 */
export function waitForEmbeddedConnected(
  client: ZoomConnectionListener,
  options?: { timeoutMs?: number; onState?: (state: string) => void },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 45000;
  const onState = options?.onState;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof client.off === "function") client.off("connection-change", onChange);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Zoom connection timed out while still Connecting")));
    }, timeoutMs);

    function onChange(payload: unknown) {
      const state = zoomConnectionStateOf(payload);
      onState?.(state);
      if (isZoomConnectionConnected(state)) {
        finish(() => resolve());
        return;
      }
      if (isZoomConnectionTerminalFailure(state)) {
        finish(() => reject(new Error(`Zoom connection ${state || "failed"} before Connected`)));
      }
    }

    if (typeof client.on !== "function") {
      finish(() =>
        reject(
          new Error("Zoom Component View has no connection-change API — refusing false Connected"),
        ),
      );
      return;
    }

    client.on("connection-change", onChange);
  });
}
