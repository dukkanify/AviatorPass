import { authFetch, getCsrfToken } from "@/features/auth/services/auth-api";

export type EndClassroomResult = {
  released?: boolean;
  hostFree?: boolean;
  classCompleted?: boolean;
  staleEnded?: string[];
  otherLiveMeetings?: string[];
  message?: string;
};

/** Host-only: end this classroom for everyone and free the shared Zoom host. */
export async function endClassroomForEveryone(liveClassId: string): Promise<{
  ok: boolean;
  data: EndClassroomResult | null;
  error: string | null;
}> {
  const result = await authFetch<EndClassroomResult>("/api/zoom/end-classroom", {
    method: "POST",
    body: JSON.stringify({ liveClassId }),
  });
  return {
    ok: Boolean(result.success),
    data: result.data ?? null,
    error: result.error ?? null,
  };
}

/** Best-effort keepalive end when the host closes the tab mid-meeting. */
export function beaconEndClassroom(liveClassId: string): void {
  if (typeof window === "undefined" || !liveClassId) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;
  void fetch("/api/zoom/end-classroom", {
    method: "POST",
    headers,
    body: JSON.stringify({ liveClassId }),
    keepalive: true,
    credentials: "include",
  }).catch(() => undefined);
}
