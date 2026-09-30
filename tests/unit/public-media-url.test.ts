import { describe, expect, it } from "vitest";

import {
  isAllowedBlobPath,
  isVercelBlobUrl,
  rewriteDisplayMediaUrl,
  toFirstPartyMediaUrl,
  usableMediaSrc,
} from "@/lib/media/public-media-url";

describe("private Blob images stay visible on AviatorPass", () => {
  it("accepts Vercel Blob hosts and aep-uploads paths only", () => {
    expect(isVercelBlobUrl("https://abc.blob.vercel-storage.com/aep-uploads/cover.png")).toBe(true);
    expect(isVercelBlobUrl("https://evil.example/aep-uploads/cover.png")).toBe(false);
    expect(isAllowedBlobPath("aep-uploads/courses/cover.png")).toBe(true);
    expect(isAllowedBlobPath("../secret.png")).toBe(false);
    expect(isAllowedBlobPath("other/cover.png")).toBe(false);
  });

  it("rewrites private Blob URLs through the first-party media route", () => {
    const raw = "https://abc.blob.vercel-storage.com/aep-uploads/courses/cover.png";
    expect(toFirstPartyMediaUrl("aep-uploads/courses/cover.png")).toBe(
      "/api/media/file?path=aep-uploads%2Fcourses%2Fcover.png",
    );
    expect(rewriteDisplayMediaUrl(raw)).toBe(`/api/media/file?src=${encodeURIComponent(raw)}`);
  });

  it("lets SafeImage use the proxy instead of a broken unknown src", () => {
    const raw = "https://store.blob.vercel-storage.com/aep-uploads/met.png";
    expect(usableMediaSrc("unknown")).toBeNull();
    expect(usableMediaSrc(raw)).toBe(`/api/media/file?src=${encodeURIComponent(raw)}`);
  });
});
