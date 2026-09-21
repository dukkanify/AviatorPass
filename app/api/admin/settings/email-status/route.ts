import { NextResponse } from "next/server";

import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import { PERMISSIONS } from "@/constants/permissions";
import {
  getPlatformSettings,
  resolveAdminNotificationEmail,
} from "@/services/settings/settings-service";
import {
  inspectResendDelivery,
  registerResendDomain,
  verifyResendDomain,
} from "@/services/email/resend-status";
import { isEmailDeliveryConfigured } from "@/services/email/mailer";
import { listOutboundEmails } from "@/services/email/outbox";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_EMAIL);
    const settings = getPlatformSettings();
    const admin = resolveAdminNotificationEmail(settings);
    const status = await inspectResendDelivery({ senderEmail: settings.email.senderEmail });
    const recent = listOutboundEmails(10).map((m) => ({
      id: m.id,
      to: m.to,
      subject: m.subject,
      mode: m.mode,
      error: m.error ?? null,
      queueStatus: m.queueStatus ?? "none",
      createdAt: m.createdAt,
    }));
    return NextResponse.json({
      success: true,
      data: {
        configured: isEmailDeliveryConfigured(),
        provider: settings.email.provider,
        senderEmail: settings.email.senderEmail,
        senderName: settings.email.senderName,
        adminNotificationEmail: admin.email,
        adminNotificationSource: admin.source,
        resend: status,
        recent,
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;
    await requirePermission(PERMISSIONS.SYSTEM_EMAIL);
    const settings = getPlatformSettings();
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      domain?: string;
      domainId?: string;
    } | null;
    const action = body?.action === "verify" ? "verify" : "register";

    if (action === "verify") {
      const inspected = await inspectResendDelivery({ senderEmail: settings.email.senderEmail });
      const domainId = (body?.domainId || inspected.domainId || "").trim();
      const verified = await verifyResendDomain(domainId);
      const status = await inspectResendDelivery({ senderEmail: settings.email.senderEmail });
      return NextResponse.json({
        success: verified.ok,
        data: { verified, resend: status },
        error: verified.ok ? null : verified.error,
      });
    }

    const domain = (body?.domain || settings.email.senderEmail.split("@")[1] || "").trim();
    const registered = await registerResendDomain(domain);
    const status = await inspectResendDelivery({ senderEmail: settings.email.senderEmail });
    return NextResponse.json({
      success: registered.ok,
      data: { registered, resend: status },
      error: registered.ok ? null : registered.error,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
