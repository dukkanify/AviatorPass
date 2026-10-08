import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requirePermission } from "@/services/auth/guards";
import { hydratePaidAtplStudentAccess } from "@/services/cgi/journey-service";
import { listMyCourses } from "@/services/learning/learning-service";
import { learningErrorResponse } from "@/app/api/learning/_utils";

export async function GET(request: Request) {
  try {
    const user = await requirePermission(PERMISSIONS.COURSES_ENROLLED);
    try {
      await hydratePaidAtplStudentAccess(user.id, user.email);
    } catch (error) {
      console.error("[learning] hydratePaidAtplStudentAccess failed", error);
    }
    const { searchParams } = new URL(request.url);
    const data = listMyCourses(user.id, {
      q: searchParams.get("q") ?? undefined,
      sort: (searchParams.get("sort") as "title" | "progress" | "recent") ?? "recent",
      favoritedOnly: searchParams.get("favorited") === "1",
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return learningErrorResponse(error);
  }
}
