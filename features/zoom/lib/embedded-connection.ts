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

/**
 * Subscribe before join() so a Connected event during join is not missed.
 * Resolves on Connected; rejects on Closed/Fail or timeout.
 * If the client has no event API, resolves after a short paint delay.
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
      clearTimeout(timer);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, 1200);
      return;
    }

    client.on("connection-change", onChange);
  });
}
