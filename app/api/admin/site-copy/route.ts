import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { enforceMutatingApiSecurity } from "@/lib/security/api-guard";
import { revalidateSiteCopyPage } from "@/lib/marketing/revalidate-marketing";
import { authErrorResponse, requirePermission } from "@/services/auth/guards";
import {
  getSiteCopySnapshot,
  listSiteCopySnapshots,
  parseSiteCopyPageId,
  resetFieldCopy,
  resetPageCopy,
  updatePageCopy,
} from "@/services/marketing/site-copy-service";
import { writeOpsLog } from "@/services/ops/logging-service";

export async function GET(request: Request) {
  try {
    await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const { searchParams } = new URL(request.url);
    const pageId = parseSiteCopyPageId(searchParams.get("page"));
    if (pageId) {
      return NextResponse.json({
        success: true,
        data: getSiteCopySnapshot(pageId),
        error: null,
      });
    }
    return NextResponse.json({
      success: true,
      data: { pages: listSiteCopySnapshots() },
      error: null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const blocked = await enforceMutatingApiSecurity(request);
    if (blocked) return blocked;

    const user = await requirePermission(PERMISSIONS.SYSTEM_SETTINGS);
    const body = (await request.json().catch(() => null)) as {
      pageId?: string;
      fields?: Record<string, string>;
      resetPage?: boolean;
      resetField?: string;
    } | null;

    const pageId = parseSiteCopyPageId(body?.pageId);
    if (!pageId) {
      return NextResponse.json(
        { success: false, data: null, error: "Valid pageId is required" },
        { status: 400 },
      );
    }

    let snapshot;
    if (body?.resetPage) {
      snapshot = resetPageCopy(pageId);
    } else if (typeof body?.resetField === "string" && body.resetField.trim()) {
      snapshot = resetFieldCopy(pageId, body.resetField.trim());
    } else if (body?.fields && typeof body.fields === "object") {
      snapshot = updatePageCopy(pageId, body.fields);
    } else {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: "Provide fields, resetPage, or resetField",
        },
        { status: 400 },
      );
    }

    writeOpsLog({
      level: "info",
      category: "audit",
      message: `Site copy updated (${pageId})`,
      userId: user.id,
      path: "/api/admin/site-copy",
    });

    revalidateSiteCopyPage(pageId);

    return NextResponse.json({ success: true, data: snapshot, error: null });
  } catch (error) {
    return authErrorResponse(error);
  }
}
