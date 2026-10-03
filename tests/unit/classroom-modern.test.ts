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
    expect(join).not.toContain('from "@/components/ui/card"');
  });

  it("keeps in-app controls and preloads the Zoom SDK", () => {
    const room = readFileSync(
      resolve(process.cwd(), "features/zoom/components/in-app-zoom-room.tsx"),
      "utf8",
    );
    expect(room).toMatch(/classroom-stage/);
    expect(room).toMatch(/classroom-dock/);
    expect(room).toMatch(/Leave classroom/);
    expect(room).toMatch(/prefetchZoomEmbeddedSdk/);
    expect(room).toMatch(/startLocalMedia\(\)/);
  });

  it("preconnects the Zoom CDN on the join route", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/join/layout.tsx"), "utf8");
    expect(layout).toMatch(/source\.zoom\.us/);
    expect(layout).toMatch(/preconnect/);
  });
});
