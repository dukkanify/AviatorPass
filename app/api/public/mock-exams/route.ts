import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { getPublicElpCatalog } from "@/services/mock-exams/booking-service";
import { getMockExamSlots } from "@/services/mock-exams/availability-service";
import { MockExamError } from "@/services/mock-exams/pricing-service";

export async function GET(request: Request) {
  try {
    await ensureCsrfToken();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "catalog";
    const catalog = getPublicElpCatalog();

    if (view === "catalog") {
      return NextResponse.json({ success: true, data: catalog, error: null });
    }

    if (view === "slots") {
      const date = searchParams.get("date");
      const examinerId = searchParams.get("examinerId") ?? catalog.examiners[0]?.id;
      const examTypeId = searchParams.get("examTypeId") ?? catalog.examTypes[0]?.id;
      if (!date || !examinerId || !examTypeId) {
        return NextResponse.json(
          { success: false, data: null, error: "date is required" },
          { status: 400 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          catalog,
          slots: getMockExamSlots({ date, examinerId, examTypeId }),
        },
        error: null,
      });
    }

    return NextResponse.json(
      { success: false, data: null, error: "Unknown view" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof MockExamError) {
      return NextResponse.json(
        { success: false, data: null, error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: "Unable to load ELP mock exam slots" },
      { status: 500 },
    );
  }
}
