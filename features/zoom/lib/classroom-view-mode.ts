/**
 * Dual-path Meeting SDK view selection.
 * Default: Client View (ZoomMtg) for all devices — Component View sticks on
 * "Connecting" / black stage under AviatorPass React 19 (Zoom peer is React 18.2).
 * Escape hatch: ?sdkView=component (desktop debugging only).
 * @see https://developers.zoom.us/docs/meeting-sdk/web/browser-support/
 */

export type ClassroomSdkView = "client" | "component";

/** Legacy breakpoint retained for tests / docs; default path no longer uses it. */
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

  // Default Client View everywhere. Component View remains available via
  // ?sdkView=component for controlled desktop experiments only.
  void input?.width;
  void input?.userAgent;
  return true;
}

export function resolveClassroomSdkView(input?: {
  width?: number;
  userAgent?: string;
  search?: string;
}): ClassroomSdkView {
  return prefersMeetingSdkClientView(input) ? "client" : "component";
}
