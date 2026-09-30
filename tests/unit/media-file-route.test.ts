import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/media/file/route";

describe("first-party media file route", () => {
  it("rejects missing and foreign sources", async () => {
    const missing = await GET(new Request("https://www.aviatorpass.com/api/media/file"));
    expect(missing.status).toBe(400);

    const foreign = await GET(
      new Request("https://www.aviatorpass.com/api/media/file?src=https://evil.example/x.png"),
    );
    expect(foreign.status).toBe(400);

    const traversal = await GET(
      new Request("https://www.aviatorpass.com/api/media/file?path=../secret.png"),
    );
    expect(traversal.status).toBe(400);
  });
});
