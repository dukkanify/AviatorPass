/**
 * Dual-path Meeting SDK view selection.
 * Zoom: Component View is unsupported on mobile/tablet — use Client View there.
 * @see https://developers.zoom.us/docs/meeting-sdk/web/browser-support/
 */

export type ClassroomSdkView = "client" | "component";

/** Breakpoint aligned with classroom CSS tablet/phone layouts. */
export const CLASSROOM_CLIENT_VIEW_MAX_PX = 1024;

export function prefersMeetingSdkClientView(input?: {
  width?: number;
  userAgent?: string;
  search?: string;
}): boolean {
  const search = input?.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const forced = params.get("sdkView");
  if (forced === "client") return true;
  if (forced === "component") return false;

  const ua = input?.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const width =
    input?.width ??
    (typeof window !== "undefined" ? window.innerWidth : CLASSROOM_CLIENT_VIEW_MAX_PX + 1);
  return mobileUa || width <= CLASSROOM_CLIENT_VIEW_MAX_PX;
}

export function resolveClassroomSdkView(input?: {
  width?: number;
  userAgent?: string;
  search?: string;
}): ClassroomSdkView {
  return prefersMeetingSdkClientView(input) ? "client" : "component";
}
