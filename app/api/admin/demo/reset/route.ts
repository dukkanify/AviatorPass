import { NextResponse } from "next/server";

import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import { PERMISSIONS } from "@/constants/permissions";
import { isLiveProductionRuntime } from "@/config/env";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { writeOpsLog } from "@/services/ops/logging-service";
import { resetDemoEnvironment } from "@/services/demo/reset-demo-environment";
import { DEMO_ACCOUNT_PASSWORD } from "@/constants/demo-accounts";
import { passwordMeetsAllRequirements } from "@/utils/password-rules";

/**
 * Super Admin — reset permanent demo accounts and re-apply demo domain data.
 * POST /api/admin/demo/reset
 */
export async function POST(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    const user = await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const body = (await request.json().catch(() => null)) as {
      password?: string;
    } | null;

    const requested =
      typeof body?.password === "string" && body.password.trim().length > 0
        ? body.password.trim()
        : null;

    // Live Production must never fall back to the documented DemoPass123! secret.
    if (isLiveProductionRuntime()) {
      if (!requested || !passwordMeetsAllRequirements(requested)) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error:
              "Production demo reset requires an explicit strong password in the request body. The documented demo password is not allowed.",
          },
          { status: 400 },
        );
      }
      if (requested === DEMO_ACCOUNT_PASSWORD) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: "The documented demo password cannot be applied on Production.",
          },
          { status: 400 },
        );
      }
    }

    const password = requested ?? DEMO_ACCOUNT_PASSWORD;
    const result = resetDemoEnvironment({ password });

    void writeOpsLog({
      level: "info",
      category: "audit",
      message: "Demo environment reset",
      userId: user.id,
      details: {
        accounts: result.accounts.map((a) => a.email),
        studentEnrollments: result.studentEnrollments,
        // Never log password material
        passwordRotated: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        // Never echo password on live Production; non-prod may show for local demos only.
        password: isLiveProductionRuntime() ? undefined : result.password,
        hint: isLiveProductionRuntime()
          ? "Passwords rotated. Sign in with email OTP or the password delivered via your secure vault — not logged here."
          : "Sign in with demo OTP (ENABLE_DEMO_OTP) or the temporary password returned for local demos.",
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const { PRIMARY_DEMO_EMAILS, DEMO_ACCOUNT_PASSWORD, DEMO_OTP_CODE_DEFAULT } =
      await import("@/constants/demo-accounts");
    const { findUserByEmail } = await import("@/services/auth/store");

    return NextResponse.json({
      success: true,
      data: {
        accounts: Object.entries(PRIMARY_DEMO_EMAILS).map(([key, email]) => {
          const u = findUserByEmail(email);
          return {
            key,
            email,
            role: u?.role ?? null,
            status: u?.status ?? null,
            exists: Boolean(u),
          };
        }),
        otpHint: isLiveProductionRuntime() ? null : DEMO_OTP_CODE_DEFAULT,
        passwordHint: isLiveProductionRuntime() ? null : DEMO_ACCOUNT_PASSWORD,
      },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
