export function toWebClientUrl(
  joinUrl: string,
  meetingNumber?: string | null,
  password?: string | null,
  origin = "https://www.aviatorpass.com",
) {
  try {
    const url = new URL(joinUrl, origin);
    const fromPath = url.pathname.match(/\/(?:j|wc)\/(\d+)/);
    const id = meetingNumber || fromPath?.[1] || "";
    if (!id) return joinUrl;
    const pwd = url.searchParams.get("pwd") || password || "";
    const next = new URL(`https://zoom.us/wc/${id}/join`);
    if (pwd) next.searchParams.set("pwd", pwd);
    return next.toString();
  } catch {
    return joinUrl;
  }
}

export function isSameOriginJoin(joinUrl: string, origin?: string) {
  try {
    const url = new URL(joinUrl, origin || "https://www.aviatorpass.com");
    return Boolean(origin) && url.origin === origin;
  } catch {
    return false;
  }
}
