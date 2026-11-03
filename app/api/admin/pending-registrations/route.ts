import { NextResponse } from "next/server";

import { ROLES } from "@/constants/roles";
import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import { readAuthDb } from "@/services/auth/store";
import { hasMinRole } from "@/utils/rbac";

/** Incomplete sign-ups waiting for OTP — visible in the admin control panel. */
export async function GET() {
  try {
    const actor = await requireAuth();
    if (!hasMinRole(actor.role, ROLES.ADMIN)) {
      return NextResponse.json(
        { success: false, data: null, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const now = Date.now();
    const pending = readAuthDb()
      .pendingRegistrations.filter((row) => Date.parse(row.expiresAt) > now)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email,
        phone: row.phone,
        countryCode: row.countryCode,
        nationality: row.nationality,
        role: row.role,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        status: "awaiting_otp" as const,
      }));

    return NextResponse.json({ success: true, data: pending, error: null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
