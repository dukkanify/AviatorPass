import { NextResponse } from "next/server";

import { authErrorResponse, requireAuth } from "@/services/auth/guards";
import { listUsersByRole } from "@/services/dashboard/metrics";
import { ROLES, type Role } from "@/constants/roles";
import { hasMinRole } from "@/utils/rbac";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { adminCreateUserSchema } from "@/utils/validation";
import { createManagedUser, UserAdminError } from "@/services/users/user-admin-service";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    if (!hasMinRole(user.role, ROLES.ADMIN)) {
      return NextResponse.json(
        { success: false, data: null, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") as Role | null;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) || 1 : 1;
    const pageSize = searchParams.get("pageSize")
      ? Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 50))
      : undefined;
    const users = listUsersByRole(role ?? undefined, pageSize ? { page, pageSize } : undefined);

    // Admins cannot see super_admins in lists unless they are super admin
    const filtered =
      user.role === ROLES.SUPER_ADMIN ? users : users.filter((u) => u.role !== ROLES.SUPER_ADMIN);

    return NextResponse.json({
      success: true,
      data: filtered,
      error: null,
      meta: pageSize ? { page, pageSize } : undefined,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => null);
    const parsed = adminCreateUserSchema.safeParse(body);
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

    const created = await createManagedUser(actor, parsed.data);
    return NextResponse.json({ success: true, data: created, error: null }, { status: 201 });
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
