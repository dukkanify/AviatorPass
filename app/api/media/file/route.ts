import { NextResponse } from "next/server";

import { isBlobConfigured } from "@/lib/ops/upload-backend";
import { isAllowedBlobPath, isVercelBlobUrl } from "@/lib/media/public-media-url";

export const dynamic = "force-dynamic";

async function readBlob(ref: string) {
  const { get } = await import("@vercel/blob");
  const privateResult = await get(ref, { access: "private" }).catch(() => null);
  if (privateResult?.statusCode === 200 && privateResult.stream) return privateResult;
  const publicResult = await get(ref, { access: "public" }).catch(() => null);
  if (publicResult?.statusCode === 200 && publicResult.stream) return publicResult;
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = (searchParams.get("path") ?? "").trim();
  const src = (searchParams.get("src") ?? "").trim();

  let ref = "";
  if (path) {
    const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!isAllowedBlobPath(clean)) {
      return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
    }
    ref = clean;
  } else if (src) {
    if (!isVercelBlobUrl(src)) {
      return NextResponse.json({ error: "Invalid media source" }, { status: 400 });
    }
    ref = src;
  } else {
    return NextResponse.json({ error: "path or src is required" }, { status: 400 });
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const result = await readBlob(ref);
  if (!result) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Disposition": "inline",
    },
  });
}
