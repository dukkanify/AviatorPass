/**
 * Branded HTML email templates for AviatorPass.
 * Uses platform settings for logo, colors, and footer.
 */

import { getPlatformSettings } from "@/services/settings/settings-service";

export interface EmailTemplatePayload {
  title: string;
  preheader?: string;
  bodyHtml: string;
}

export function renderBrandedEmail(payload: EmailTemplatePayload): {
  subject: string;
  html: string;
  text: string;
} {
  const s = getPlatformSettings();
  const brand = s.branding;
  const general = s.general;
  const primary = brand.primaryColor;
  const accent = brand.accentColor;
  const logo = brand.logoUrl.startsWith("http")
    ? brand.logoUrl
    : `${general.websiteUrl.replace(/\/$/, "")}${brand.logoUrl}`;

  const social = [
    general.socialLinks.instagram
      ? `<a href="${general.socialLinks.instagram}" style="color:${accent};text-decoration:none;margin:0 8px;">Instagram</a>`
      : "",
    general.socialLinks.twitter
      ? `<a href="${general.socialLinks.twitter}" style="color:${accent};text-decoration:none;margin:0 8px;">X</a>`
      : "",
    general.socialLinks.linkedin
      ? `<a href="${general.socialLinks.linkedin}" style="color:${accent};text-decoration:none;margin:0 8px;">LinkedIn</a>`
      : "",
    general.socialLinks.youtube
      ? `<a href="${general.socialLinks.youtube}" style="color:${accent};text-decoration:none;margin:0 8px;">YouTube</a>`
      : "",
    general.socialHandle
      ? `<span style="color:#94a3b8;margin:0 8px;">${general.socialHandle}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const locations = general.primaryLocations.join(" · ");

  const site = general.websiteUrl.replace(/\/$/, "") || "https://www.aviatorpass.com";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${payload.title}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .ap-body { background:#0B1A24 !important; color:#E8EEF4 !important; }
      .ap-card { background:#143048 !important; border-color:#2A4A66 !important; }
      .ap-copy { color:#E8EEF4 !important; }
      .ap-title { color:#F6C36C !important; }
    }
    @media only screen and (max-width: 620px) {
      .ap-card { width:100% !important; }
      .ap-pad { padding:20px 16px !important; }
    }
  </style>
</head>
<body class="ap-body" style="margin:0;padding:0;background:#F3F6F9;font-family:'IBM Plex Sans',Arial,sans-serif;color:${primary};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${payload.preheader ?? ""}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F6F9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table class="ap-card" role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #D8E0E8;">
          <tr>
            <td class="ap-pad" style="background:${primary};padding:24px 32px;">
              <a href="${site}" style="text-decoration:none;">
                <img src="${logo}" alt="${general.platformName}" height="40" style="display:block;height:40px;width:auto;border:0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="ap-pad ap-copy" style="padding:32px;">
              <h1 class="ap-title" style="margin:0 0 16px;font-family:'Exo 2',Arial,sans-serif;font-size:22px;color:${primary};">${payload.title}</h1>
              <div style="font-size:15px;line-height:1.6;color:#0B1A24;">${payload.bodyHtml}</div>
              <p style="margin-top:24px;"><a href="${site}" style="color:${accent};">Open AviatorPass</a></p>
            </td>
          </tr>
          <tr>
            <td class="ap-pad" style="padding:20px 32px;background:#0B1A24;color:#E2E8F0;font-size:12px;line-height:1.6;">
              <strong style="color:#fff;">${general.companyName}</strong><br/>
              YOUR AVIATION JOURNEY STARTS HERE<br/>
              ${general.footerText}<br/>
              ${locations}<br/>
              <a href="${site}" style="color:${accent};">${site}</a><br/>
              <a href="mailto:${general.contactEmail}" style="color:${accent};">${general.contactEmail}</a>
              ·
              <a href="mailto:${general.supportEmail}" style="color:${accent};">${general.supportEmail}</a>
              <div style="margin-top:10px;">
                <a href="${site}/legal/terms" style="color:${accent};">Terms of Service</a>
                ·
                <a href="${site}/legal/privacy" style="color:${accent};">Privacy Policy</a>
              </div>
              <div style="margin-top:12px;">${social}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    payload.title,
    "",
    payload.bodyHtml.replace(/<[^>]+>/g, " "),
    "",
    `${general.companyName} · ${locations}`,
    general.contactEmail,
    general.supportEmail,
    general.socialHandle,
  ].join("\n");

  return { subject: payload.title, html, text };
}

export function otpEmailTemplate(
  code: string,
  purpose: string,
  options?: { expiresInMinutes?: number },
) {
  const expiresInMinutes = options?.expiresInMinutes ?? 10;
  return renderBrandedEmail({
    title: "Your verification code",
    preheader: `Use your AviatorPass code within ${expiresInMinutes} minutes`,
    bodyHtml: `<p>Use this one-time code to ${purpose}:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#143048;margin:24px 0;">${code}</p>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
      <p style="color:#64748b;font-size:13px;">If you do not see this message in your inbox, check spam or junk. If you did not request this code, you can ignore this email. Never share your code with anyone.</p>
      <p style="color:#64748b;font-size:13px;margin-top:16px;">Need help? Contact support via the address in this email footer.</p>`,
  });
}

export function verificationSuccessEmailTemplate(input: { firstName: string; role: string }) {
  const name = input.firstName || "Aviator";
  return renderBrandedEmail({
    title: "Email verified — account ready",
    preheader: `Welcome to Aviator Pass, ${name}`,
    bodyHtml: `<p>Hi ${name},</p>
      <p>Your email is verified and your <strong>${input.role}</strong> account is ready.</p>
      <p>Sign in anytime to continue your aviation training journey.</p>`,
  });
}

export function accountCreatedEmailTemplate(input: { firstName: string }) {
  const name = input.firstName || "Aviator";
  return renderBrandedEmail({
    title: "Your AviatorPass account was created",
    preheader: "Profile, security settings, and preferences are ready",
    bodyHtml: `<p>Hi ${name},</p>
      <p>Your AviatorPass profile, notification preferences, and security defaults are in place.</p>
      <p>Complete your profile to unlock the full student dashboard.</p>`,
  });
}
export function testEmailTemplate() {
  return renderBrandedEmail({
    title: "Test email from AviatorPass",
    preheader: "Your email configuration is working.",
    bodyHtml: `<p>This is a test message from the Super Admin email configuration panel.</p>
      <p>If you received this, outbound email settings are reachable from the platform.</p>`,
  });
}

export function classReminderEmailTemplate(input: {
  title: string;
  startsAt: string;
  label: string;
  joinUrl?: string;
}) {
  const when = new Date(input.startsAt).toLocaleString();
  const joinBlock = input.joinUrl
    ? `<p><a href="${input.joinUrl}">Join Zoom class</a></p>`
    : `<p>Open AviatorPass to join your live Zoom session when it is time.</p>`;
  return renderBrandedEmail({
    title: input.label,
    preheader: `${input.title} · ${when}`,
    bodyHtml: `<p><strong>${input.label}</strong></p>
      <p>${input.title}</p>
      <p>Starts: ${when}</p>
      ${joinBlock}`,
  });
}

export function installmentReminderEmailTemplate(input: {
  productName: string;
  amountLabel: string;
  dueLabel: string;
  kind: "due_soon" | "due_today" | "overdue";
  sequence: number;
  totalCount: number;
}) {
  const title =
    input.kind === "overdue"
      ? "Installment overdue"
      : input.kind === "due_today"
        ? "Installment due today"
        : "Upcoming installment reminder";
  return renderBrandedEmail({
    title,
    preheader: `${input.productName} · ${input.amountLabel}`,
    bodyHtml: `<p><strong>${title}</strong></p>
      <p>${input.productName}</p>
      <p>Installment ${input.sequence} of ${input.totalCount}: <strong>${input.amountLabel}</strong></p>
      <p>Due date: ${input.dueLabel}</p>
      <p>Pay from your AviatorPass billing center to keep course access active.</p>`,
  });
}

/** CR006 — post-lecture student evaluation / performance report. */
export function performanceReportEmailTemplate(input: {
  studentName: string;
  classTitle: string;
  courseCode: string | null;
  instructorName: string | null;
  todaysTopic: string;
  nextTopic: string;
  homework: string;
  performanceLabel: string;
  questionBank: string;
  comments: string;
}) {
  const courseLine = input.courseCode ? ` (${input.courseCode})` : "";
  const commentsBlock = input.comments
    ? `<p><strong>Comments</strong><br/>${escapeHtml(input.comments)}</p>`
    : "";
  return renderBrandedEmail({
    title: "Performance report",
    preheader: `${input.classTitle} · ${input.performanceLabel}`,
    bodyHtml: `<p>Hello ${escapeHtml(input.studentName)},</p>
      <p>Your instructor${input.instructorName ? ` (${escapeHtml(input.instructorName)})` : ""} submitted a performance report after <strong>${escapeHtml(input.classTitle)}</strong>${escapeHtml(courseLine)}.</p>
      <p><strong>Today's Topic</strong><br/>${escapeHtml(input.todaysTopic)}</p>
      <p><strong>Next Topic</strong><br/>${escapeHtml(input.nextTopic)}</p>
      <p><strong>Homework</strong><br/>${escapeHtml(input.homework)}</p>
      <p><strong>Performance</strong><br/>${escapeHtml(input.performanceLabel)}</p>
      <p><strong>Question Bank</strong><br/>${escapeHtml(input.questionBank)}</p>
      ${commentsBlock}
      <p>Open AviatorPass → Progress / Performance reports to review this in your account.</p>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function welcomeEmailTemplate(input: { firstName: string }) {
  const name = escapeHtml(input.firstName || "Aviator");
  return renderBrandedEmail({
    title: "Welcome to AviatorPass",
    preheader: "YOUR AVIATION JOURNEY STARTS HERE",
    bodyHtml: `<p>Hi ${name},</p>
      <p>Welcome to AviatorPass. Your student workspace, courses, and live classes are ready.</p>
      <p>Sign in to continue enrolment, billing, and your ATPL journey.</p>`,
  });
}

export function passwordResetEmailTemplate(input: { firstName?: string }) {
  const name = escapeHtml(input.firstName || "Aviator");
  return renderBrandedEmail({
    title: "Reset your password",
    preheader: "Use the verification code we sent, or request a new one",
    bodyHtml: `<p>Hi ${name},</p>
      <p>A password reset was requested for your AviatorPass account.</p>
      <p>Use the one-time code in the verification email to choose a new password. If you did not request this, you can ignore this message.</p>`,
  });
}

export function purchaseConfirmationEmailTemplate(input: {
  firstName?: string;
  productName: string;
  amountLabel?: string;
  reference?: string;
}) {
  return renderBrandedEmail({
    title: "Purchase confirmed",
    preheader: input.productName,
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Aviator")},</p>
      <p>Your purchase of <strong>${escapeHtml(input.productName)}</strong> is confirmed.</p>
      ${input.amountLabel ? `<p>Amount: <strong>${escapeHtml(input.amountLabel)}</strong></p>` : ""}
      ${input.reference ? `<p>Reference: ${escapeHtml(input.reference)}</p>` : ""}
      <p>Open My Courses to start learning.</p>`,
  });
}

export function paymentFailedEmailTemplate(input: { firstName?: string; detail?: string }) {
  return renderBrandedEmail({
    title: "Payment failed",
    preheader: "We could not complete your payment",
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Aviator")},</p>
      <p>${escapeHtml(input.detail || "We could not process your payment. Try another method from checkout.")}</p>`,
  });
}

export function refundEmailTemplate(input: {
  firstName?: string;
  amountLabel?: string;
  reference?: string;
}) {
  return renderBrandedEmail({
    title: "Refund processed",
    preheader: input.amountLabel || "A refund was issued",
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Aviator")},</p>
      <p>A refund has been issued${input.amountLabel ? ` for <strong>${escapeHtml(input.amountLabel)}</strong>` : ""}.</p>
      ${input.reference ? `<p>Reference: ${escapeHtml(input.reference)}</p>` : ""}`,
  });
}

export function enrollmentEmailTemplate(input: { firstName?: string; courseName?: string }) {
  return renderBrandedEmail({
    title: "You are enrolled",
    preheader: input.courseName || "Course access is ready",
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Aviator")},</p>
      <p>You are enrolled${input.courseName ? ` in <strong>${escapeHtml(input.courseName)}</strong>` : ""}.</p>
      <p>Open AviatorPass → My Courses to begin.</p>`,
  });
}

export function instructorAssignmentEmailTemplate(input: {
  firstName?: string;
  studentName?: string;
  courseName?: string;
}) {
  return renderBrandedEmail({
    title: "New student assigned",
    preheader: input.studentName || "A student was assigned to you",
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Instructor")},</p>
      <p>${escapeHtml(input.studentName || "A student")} was assigned${input.courseName ? ` for <strong>${escapeHtml(input.courseName)}</strong>` : ""}.</p>
      <p>Open the instructor dashboard to review the assignment.</p>`,
  });
}

export function liveClassEmailTemplate(input: {
  kind:
    "created" | "updated" | "cancelled" | "started" | "finished" | "reminder_24h" | "reminder_2h";
  title: string;
  when?: string;
  joinUrl?: string;
}) {
  const labels: Record<typeof input.kind, string> = {
    created: "Live class created",
    updated: "Live class updated",
    cancelled: "Live class cancelled",
    started: "Class started",
    finished: "Class finished",
    reminder_24h: "Reminder — class in 24 hours",
    reminder_2h: "Reminder — class in 2 hours",
  };
  const join = input.joinUrl
    ? `<p><a href="${escapeHtml(input.joinUrl)}">Join Zoom class</a></p>`
    : "";
  return renderBrandedEmail({
    title: labels[input.kind],
    preheader: `${input.title}${input.when ? ` · ${input.when}` : ""}`,
    bodyHtml: `<p><strong>${escapeHtml(input.title)}</strong></p>
      ${input.when ? `<p>When: ${escapeHtml(input.when)}</p>` : ""}
      ${join}`,
  });
}

export function certificateIssuedEmailTemplate(input: { firstName?: string; title?: string }) {
  return renderBrandedEmail({
    title: "Certificate issued",
    preheader: input.title || "Your certificate is ready",
    bodyHtml: `<p>Hi ${escapeHtml(input.firstName || "Aviator")},</p>
      <p>Your certificate${input.title ? ` for <strong>${escapeHtml(input.title)}</strong>` : ""} is ready.</p>
      <p>Download it from AviatorPass → Certificates.</p>`,
  });
}
