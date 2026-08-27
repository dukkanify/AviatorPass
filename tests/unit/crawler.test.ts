import { describe, expect, it } from "vitest";

import { isLikelyCrawler } from "@/lib/http/crawler";

describe("isLikelyCrawler", () => {
  it("detects common crawlers without treating browsers as bots", () => {
    expect(isLikelyCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isLikelyCrawler("facebookexternalhit/1.1")).toBe(true);
    expect(
      isLikelyCrawler(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0",
      ),
    ).toBe(false);
    expect(isLikelyCrawler("")).toBe(false);
    expect(isLikelyCrawler(null)).toBe(false);
  });
});
