import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("modern classroom join page", () => {
  it("uses a full-viewport classroom shell instead of a nested card", () => {
    const join = readFileSync(
      resolve(process.cwd(), "features/classes/components/join-class-client.tsx"),
      "utf8",
    );
    expect(join).toMatch(/classroom-shell/);
    expect(join).toMatch(/prefetchZoomEmbeddedSdk/);
    expect(join).toMatch(/next\/dynamic/);
    expect(join).toMatch(/displayName/);
    expect(join).toMatch(/overflowY:\s*"auto"/);
    expect(join).not.toContain("Passcode");
    expect(join).not.toContain("Waiting room on");
    expect(join).not.toContain('from "@/components/ui/card"');
  });

  it("keeps in-app controls and preloads the Zoom SDK", () => {
    const room = readFileSync(
      resolve(process.cwd(), "features/zoom/components/in-app-zoom-room.tsx"),
      "utf8",
    );
    expect(room).toMatch(/classroom-stage/);
    expect(room).toMatch(/classroom-chrome/);
    expect(room).toMatch(/classroom-viewport/);
    expect(room).toMatch(/classroom-footer/);
    expect(room).toMatch(/classroom-dock/);
    expect(room).toMatch(/Leave Class/);
    expect(room).toMatch(/Open classroom again/);
    expect(room).toMatch(/setSession\(null\)/);
    expect(room).toMatch(/Share Screen/);
    expect(room).toMatch(/classroom-rail/);
    expect(room).toMatch(/classroom-dock-cluster/);
    expect(room).toMatch(/displayName/);
    expect(room).toMatch(/prefetchZoomEmbeddedSdk/);
    expect(room).toMatch(/startLocalMedia\(\)/);
    expect(room).not.toContain("Passcode ${");
    expect(room).not.toContain("from-black/80");
    expect(room).not.toContain("bottom-24");
  });

  it("keeps classroom title and notices outside the camera frame", () => {
    const css = readFileSync(resolve(process.cwd(), "styles/classroom.css"), "utf8");
    expect(css).toMatch(/\.classroom-chrome/);
    expect(css).toMatch(/\.classroom-footer/);
    expect(css).toMatch(/\.classroom-preview-fallback/);
    expect(css).toMatch(/\.classroom-sdk-root\.is-live/);
    expect(css).toMatch(/position:\s*sticky/);
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(css).toMatch(/overflow-x:\s*clip/);
  });

  it("does not hard-code Share Screen as always active green", () => {
    const room = readFileSync(
      resolve(process.cwd(), "features/zoom/components/in-app-zoom-room.tsx"),
      "utf8",
    );
    expect(room).not.toMatch(/data-share="true"/);
    expect(room).toMatch(/data-share=\{shareHint/);
    expect(room).toMatch(/Camera preview only/);
    expect(room).toMatch(/railPeople/);
  });

  it("preconnects the Zoom CDN on the join route", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/join/layout.tsx"), "utf8");
    expect(layout).toMatch(/source\.zoom\.us/);
    expect(layout).toMatch(/preconnect/);
  });
});
