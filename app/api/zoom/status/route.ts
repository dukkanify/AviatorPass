import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import {
  getZoomCredentialInventory,
  isZoomConfigured,
  probeZoomHostZak,
  refreshZoomCredentialsFlag,
} from "@/services/classes/zoom-service";
import { probeMeetingSdkCredentialPair } from "@/lib/zoom/sdk-credentials";
import { getPlatformSettings } from "@/services/settings/settings-service";
import { getZoomOAuthPublicDiagnostics } from "@/services/zoom/config";
import { classErrorResponse } from "@/app/api/classes/_utils";

/** Zoom integration status — never returns secrets. */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_ZOOM);
    const configured = refreshZoomCredentialsFlag();
    const settings = getPlatformSettings();
    const inventory = getZoomCredentialInventory();
    const oauth = getZoomOAuthPublicDiagnostics();
    const [hostZak, meetingSdk] = await Promise.all([
      configured
        ? probeZoomHostZak({ accountEmail: settings.zoom.accountEmail })
        : Promise.resolve(null),
      probeMeetingSdkCredentialPair(),
    ]);
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
        instructorOAuth: {
          configured: oauth.oauthConfigured,
          redirectUri: oauth.redirectUri,
          clientIdSuffix: oauth.clientIdSuffix,
          clientIdLength: oauth.clientIdLength,
          scopes: oauth.scopes,
          includeScopesInAuthorizeUrl: oauth.includeScopesInAuthorizeUrl,
          authorizeHost: oauth.authorizeHost,
          meetingSdkClientIdSuffix: oauth.meetingSdkClientIdSuffix,
          meetingSdkClientIdLength: oauth.meetingSdkClientIdLength,
          credentialsMixed: oauth.credentialsMixed,
        },
        meetingSdk: {
          configured: meetingSdk.configured,
          clientIdSuffix: meetingSdk.clientIdSuffix,
          clientIdLength: meetingSdk.clientIdLength,
          credentialPairValid: meetingSdk.credentialPairValid,
          detail: meetingSdk.detail,
        },
        hostZak: hostZak
          ? {
              ready: hostZak.ready,
              source: hostZak.source,
              hostUser: hostZak.hostUser,
              error: hostZak.error,
              hasZakScope: hostZak.hasZakScope,
              scopes: hostZak.scopes,
            }
          : null,
      },
      error: null,
    });
  } catch (error) {
    return classErrorResponse(error);
  }
}
