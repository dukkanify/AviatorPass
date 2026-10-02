import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import {
  getZoomCredentialInventory,
  isZoomConfigured,
  refreshZoomCredentialsFlag,
} from "@/services/classes/zoom-service";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { classErrorResponse } from "@/app/api/classes/_utils";

/** Zoom integration status — never returns secrets. */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const configured = refreshZoomCredentialsFlag();
    const settings = getPlatformSettings();
    const inventory = getZoomCredentialInventory();
    return NextResponse.json({
      success: true,
      data: {
        enabled: settings.zoom.enabled,
        credentialsConfigured: configured || isZoomConfigured(),
        meetingSdkConfigured: inventory.meetingSdk,
        accountEmail: settings.zoom.accountEmail,
        defaultWaitingRoom: settings.zoom.defaultWaitingRoom,
        defaultPasscode: settings.zoom.defaultPasscode,
        defaultMeetingType: settings.zoom.defaultMeetingType,
        mode: inventory.meetingSdk ? "sdk" : configured ? "zoom" : "mock",
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
