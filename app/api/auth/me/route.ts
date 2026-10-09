import { NextResponse } from "next/server";

import {
  getCurrentSession,
  refreshSessionProfileClaimsIfStale,
} from "@/services/auth/auth-service";
import { completePaidStudentProfileFromOrder } from "@/services/auth/restore-paid-identities";
import { toUserProfile } from "@/services/auth/store";
import { ensureCsrfToken } from "@/lib/security/cookies";
import { ensureSuperAdminSeeded } from "@/services/auth/seed";

export async function GET() {
  ensureSuperAdminSeeded();
  await ensureCsrfToken();
  const session = await getCurrentSession();
  let user = session.user;
  if (user) {
    const filled = completePaidStudentProfileFromOrder(user.id, user.email);
    if (filled) {
      await refreshSessionProfileClaimsIfStale(filled);
      user = toUserProfile(filled);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      user,
      permissions: session.permissions,
      isAuthenticated: Boolean(user),
    },
    error: null,
  });
}
