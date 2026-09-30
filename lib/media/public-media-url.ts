const MEDIA_FILE_PATH = "/api/media/file";

export function isVercelBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedBlobPath(pathname: string): boolean {
  const clean = pathname.replace(/^\/+/, "").replace(/\\/g, "/");
  return clean.startsWith("aep-uploads/") && !clean.includes("..");
}

export function toFirstPartyMediaUrl(pathname: string): string {
  const clean = pathname.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${MEDIA_FILE_PATH}?path=${encodeURIComponent(clean)}`;
}

export function rewriteDisplayMediaUrl(src: string): string {
  const value = src.trim();
  if (!value) return value;
  if (value.startsWith(`${MEDIA_FILE_PATH}?`) || value === MEDIA_FILE_PATH) return value;
  if (isVercelBlobUrl(value)) {
    return `${MEDIA_FILE_PATH}?src=${encodeURIComponent(value)}`;
  }
  return value;
}

export function usableMediaSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const value = src.trim();
  if (!value) return null;
  if (/^(unknown|null|undefined|n\/a)$/i.test(value)) return null;
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  const rewritten = rewriteDisplayMediaUrl(value);
  if (rewritten.startsWith("/") || /^https?:\/\//i.test(rewritten)) return rewritten;
  return null;
}

export { MEDIA_FILE_PATH };
