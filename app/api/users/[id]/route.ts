import { NextResponse } from "next/server";

import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { ROLES } from "@/constants/roles";
import { hasMinRole } from "@/utils/rbac";
import { adminUpdateUserSchema } from "@/utils/validation";
import { updateManagedUser, UserAdminError } from "@/services/users/user-admin-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    const actor = await requireAuth();
    if (!hasMinRole(actor.role, ROLES.ADMIN)) {
      return NextResponse.json(
        { success: false, data: null, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = adminUpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? "Invalid account details",
          field: parsed.error.issues[0]?.path[0],
        },
        { status: 400 },
      );
    }

    const profile = await updateManagedUser(actor, id, parsed.data);
    return NextResponse.json({ success: true, data: profile, error: null });
  } catch (error) {
    if (error instanceof UserAdminError) {
      return NextResponse.json(
        { success: false, data: null, error: error.message, field: error.field },
        { status: error.status },
      );
    }
    return authErrorResponse(error);
  }
}
