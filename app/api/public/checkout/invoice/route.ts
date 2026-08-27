import { NextResponse } from "next/server";

import { ensureCsrfToken } from "@/lib/security/cookies";
import { paymentErrorResponse } from "@/app/api/payments/_utils";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getInvoice, renderInvoiceHtml } from "@/services/payments/invoice-service";
import {
  getWelcomeByOrderId,
  getWelcomeBySessionId,
} from "@/services/payments/purchase-first-service";

export async function GET(request: Request) {
  try {
    await ensureCsrfToken();
    ensurePaymentsSeeded();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id") ?? searchParams.get("sessionId");
    const orderId = searchParams.get("orderId");
    const snapshot = sessionId
      ? getWelcomeBySessionId(sessionId)
      : orderId
        ? getWelcomeByOrderId(orderId)
        : null;
    if (!snapshot?.invoiceId) {
      return NextResponse.json(
        { success: false, data: null, error: "Invoice is not ready yet" },
        { status: 404 },
      );
    }
    const invoice = getInvoice(snapshot.invoiceId);
    if (!invoice) {
      return NextResponse.json(
        { success: false, data: null, error: "Invoice not found" },
        { status: 404 },
      );
    }
    return new NextResponse(renderInvoiceHtml(invoice.id), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
