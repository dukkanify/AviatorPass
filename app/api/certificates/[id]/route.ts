import { NextResponse } from "next/server";

import { PERMISSIONS } from "@/constants/permissions";
import { requireAuth, requirePermission } from "@/services/auth/guards";
import { assertOwnOrManage, CertificateError } from "@/services/certificates/access";
import {
  approveCertificate,
  getCertificateById,
  reissueCertificate,
  renderCertificateHtml,
  revokeCertificate,
  updateCertificate,
} from "@/services/certificates/certificate-service";
import type { Certificate } from "@/types/certificates";
import { certificateErrorResponse } from "@/app/api/certificates/_utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const cert = getCertificateById(id);
    if (!cert) throw new CertificateError("Certificate not found", 404);
    assertOwnOrManage(user, cert.studentId);

    const { searchParams } = new URL(request.url);
    if (searchParams.get("format") === "html" || searchParams.get("print") === "1") {
      const rendered = await renderCertificateHtml(id);
      return new NextResponse(rendered.html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const rendered = await renderCertificateHtml(id);
    return NextResponse.json({
      success: true,
      data: { certificate: cert, qrDataUrl: rendered.qrDataUrl },
      error: null,
    });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const user = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      action?: "approve" | "revoke" | "reissue";
      reason?: string;
    } | null;
    switch (body?.action) {
      case "approve":
        return NextResponse.json({
          success: true,
          data: await approveCertificate(user, id),
          error: null,
        });
      case "revoke":
        return NextResponse.json({
          success: true,
          data: await revokeCertificate({
            user,
            id,
            reason: body.reason ?? "Revoked",
          }),
          error: null,
        });
      case "reissue":
        return NextResponse.json({
          success: true,
          data: await reissueCertificate({ user, id }),
          error: null,
        });
      default:
        return NextResponse.json(
          { success: false, data: null, error: "action required" },
          { status: 400 },
        );
    }
  } catch (error) {
    return certificateErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const user = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { success: false, data: null, error: "JSON body required" },
        { status: 400 },
      );
    }
    const certificate = await updateCertificate({
      user,
      id,
      patch: {
        studentName: body.studentName != null ? String(body.studentName) : undefined,
        certificateNumber:
          body.certificateNumber != null ? String(body.certificateNumber) : undefined,
        courseName: body.courseName != null ? String(body.courseName) : undefined,
        courseId:
          body.courseId === null ? null : body.courseId != null ? String(body.courseId) : undefined,
        issueDate:
          body.issueDate === null
            ? null
            : body.issueDate != null
              ? String(body.issueDate)
              : undefined,
        status: body.status != null ? (body.status as Certificate["status"]) : undefined,
        instructorName: body.instructorName != null ? String(body.instructorName) : undefined,
        instructorId:
          body.instructorId === null
            ? null
            : body.instructorId != null
              ? String(body.instructorId)
              : undefined,
        verificationCode: body.verificationCode != null ? String(body.verificationCode) : undefined,
      },
    });
    return NextResponse.json({ success: true, data: certificate, error: null });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
