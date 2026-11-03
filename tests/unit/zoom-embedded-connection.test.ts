import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isZoomConnectionConnected,
  isZoomConnectionTerminalFailure,
  stageShowsZoomConnecting,
  waitForEmbeddedConnected,
  waitForEmbeddedUiLeftConnecting,
  zoomConnectionStateOf,
} from "@/features/zoom/lib/embedded-connection";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("embedded connection-change gating", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses Connected / Fail states case-insensitively", () => {
    expect(zoomConnectionStateOf({ state: "Connected" })).toBe("Connected");
    expect(isZoomConnectionConnected("Connected")).toBe(true);
    expect(isZoomConnectionConnected("connected")).toBe(true);
    expect(isZoomConnectionTerminalFailure("Closed")).toBe(true);
    expect(isZoomConnectionTerminalFailure("Fail")).toBe(true);
    expect(isZoomConnectionTerminalFailure("Connecting")).toBe(false);
  });

  it("detects Zoom Connecting overlay text inside the stage", () => {
    const connecting = { innerText: "Connecting...", textContent: "Connecting..." } as HTMLElement;
    expect(stageShowsZoomConnecting(connecting)).toBe(true);
    const ready = { innerText: "Talking: Host", textContent: "Talking: Host" } as HTMLElement;
    expect(stageShowsZoomConnecting(ready)).toBe(false);
  });

  it("resolves on Connected and rejects on Closed", async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const client = {
      on: (event: string, cb: (payload: unknown) => void) => {
        handlers.set(event, cb);
      },
      off: (event: string) => {
        handlers.delete(event);
      },
    };

    const ok = waitForEmbeddedConnected(client, { timeoutMs: 5000 });
    handlers.get("connection-change")?.({ state: "Connecting" });
    handlers.get("connection-change")?.({ state: "Connected" });
    await expect(ok).resolves.toBeUndefined();

    const bad = waitForEmbeddedConnected(client, { timeoutMs: 5000 });
    handlers.get("connection-change")?.({ state: "Closed" });
    await expect(bad).rejects.toThrow(/closed/i);
  });

  it("rejects when client.on is missing instead of falsifying Connected", async () => {
    const client = {};
    await expect(waitForEmbeddedConnected(client, { timeoutMs: 5000 })).rejects.toThrow(
      /no connection-change API|refusing false Connected/i,
    );
  });

  it("times out while still Connecting", async () => {
    vi.useFakeTimers();
    const client = {
      on: () => undefined,
      off: () => undefined,
    };
    const pending = waitForEmbeddedConnected(client, { timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("waits for Connecting overlay to clear after Connected", async () => {
    vi.useFakeTimers();
    const state = { text: "Connecting...", hasApp: true };
    const stage = {
      get innerText() {
        return state.text;
      },
      get textContent() {
        return state.text;
      },
      querySelector: (sel: string) =>
        state.hasApp && /Zoom app container|Zoom Web SDK Widget/i.test(sel) ? {} : null,
    } as unknown as HTMLElement;
    const pending = waitForEmbeddedUiLeftConnecting(stage, { timeoutMs: 2000, pollMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    state.text = "Talking: Host";
    await vi.advanceTimersByTimeAsync(150);
    await expect(pending).resolves.toBeUndefined();
  });

  it("desktop Component View waits for Connected + UI ready before phase=sdk", () => {
    const room = src("features/zoom/components/in-app-zoom-room.tsx");
    const css = src("styles/classroom.css");

    expect(room).toMatch(/waitForEmbeddedConnected/);
    expect(room).toMatch(/waitForEmbeddedUiLeftConnecting/);
    expect(room).toMatch(/Subscribe BEFORE join/);
    expect(room).toMatch(/Meeting SDK 6\.2\.0 Connected inside AviatorPass/);
    expect(room).toMatch(/joiningSdk/);
    expect(room).toMatch(/phase === "classroom" \|\| phase === "error"/);
    expect(room).not.toMatch(/pinZoomWindowToStage/);
    expect(room).not.toMatch(/new MutationObserver/);
    expect(room).toMatch(/active\.zak \|\| active\.hostSignature/);
    expect(room).toMatch(/host token unavailable/);
    expect(room).toMatch(/updateVideoOptions/);

    expect(css).not.toMatch(/position:\s*absolute\s*!important/);
    expect(css).toMatch(/Let Zoom Component View own its layout/);
  });

  it("keeps shell In-the-meeting tied to roomPhase sdk only", () => {
    const join = src("features/classes/components/join-class-client.tsx");
    expect(join).toMatch(/const inMeeting = roomPhase === "sdk"/);
    expect(join).toMatch(/roomPhase === "sdk"[\s\S]{0,80}\? "In the meeting"/);
  });
});
