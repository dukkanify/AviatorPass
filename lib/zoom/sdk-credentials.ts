import { getServerEnv } from "@/config/env";

export function getZoomMeetingSdkCredentials(): { sdkKey: string; sdkSecret: string } | null {
  const env = getServerEnv();
  const sdkKey = env.ZOOM_SDK_KEY?.trim() || "";
  const sdkSecret = env.ZOOM_SDK_SECRET?.trim() || "";
  if (!sdkKey || !sdkSecret) return null;
  return { sdkKey, sdkSecret };
}
