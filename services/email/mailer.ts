/**
 * Outbound email mailer — SMTP via nodemailer when configured,
 * durable outbox fallback so notifications still "work" in demo/staging.
 */

import nodemailer from "nodemailer";

import { getPlatformSettings } from "@/services/settings/settings-service";
import {
  recordOutboundEmail,
  type EmailDeliveryMode,
  type OutboundEmailRecord,
} from "@/services/email/outbox";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  delivered: boolean;
  mode: EmailDeliveryMode;
  messageId?: string;
  outboxId: string;
  error?: string | null;
  record: OutboundEmailRecord;
}

function smtpConfigured(): boolean {
  const email = getPlatformSettings().email;
  if (email.provider !== "smtp") {
    return false;
  }
  return Boolean(email.smtpHost?.trim() && email.senderEmail?.trim());
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isEmailDeliveryConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

async function sendViaResend(input: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Resend HTTP ${res.status}`);
  }
  return json;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const settings = getPlatformSettings();
  const email = settings.email;
  const to = input.to.trim();
  const from = `${email.senderName || settings.general.platformName} <${email.senderEmail}>`;
  const replyTo = email.replyToEmail || email.senderEmail;

  if (!to) {
    const record = recordOutboundEmail({
      to: "",
      subject: input.subject,
      html: input.html,
      text: input.text,
      from,
      replyTo,
      provider: email.provider,
      mode: "failed",
      error: "Missing recipient",
      meta: input.meta,
    });
    return {
      success: false,
      delivered: false,
      mode: "failed",
      outboxId: record.id,
      error: "Missing recipient",
      record,
    };
  }

  // Respect global notification kill-switch except for auth OTP / system mail.
  const isSystem = Boolean(
    input.meta?.system || input.meta?.kind === "test" || input.meta?.kind === "otp",
  );
  if (!settings.notifications.emailNotifications && !isSystem) {
    const record = recordOutboundEmail({
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from,
      replyTo,
      provider: email.provider,
      mode: "failed",
      error: "Email notifications disabled in platform settings",
      meta: input.meta,
    });
    return {
      success: false,
      delivered: false,
      mode: "failed",
      outboxId: record.id,
      error: "Email notifications disabled in platform settings",
      record,
    };
  }

  if (resendConfigured() && !smtpConfigured()) {
    try {
      const info = await sendViaResend({
        from,
        to,
        replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      const record = recordOutboundEmail({
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        from,
        replyTo,
        provider: "resend",
        mode: "resend",
        error: null,
        meta: { ...(input.meta ?? {}), resendId: info.id },
      });
      return {
        success: true,
        delivered: true,
        mode: "resend",
        messageId: info.id,
        outboxId: record.id,
        error: null,
        record,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resend send failed";
      const record = recordOutboundEmail({
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        from,
        replyTo,
        provider: "resend",
        mode: "failed",
        error: message,
        meta: input.meta,
      });
      return {
        success: false,
        delivered: false,
        mode: "failed",
        outboxId: record.id,
        error: message,
        record,
      };
    }
  }

  if (smtpConfigured()) {
    try {
      const port = email.smtpPort || 587;
      const secure = email.encryption === "ssl" || port === 465;
      const transporter = nodemailer.createTransport({
        host: email.smtpHost,
        port,
        secure,
        requireTLS: email.encryption === "tls" && !secure,
        auth:
          email.smtpUsername || email.smtpPassword
            ? {
                user: email.smtpUsername,
                pass: email.smtpPassword,
              }
            : undefined,
      });

      const info = await transporter.sendMail({
        from,
        to,
        replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      const record = recordOutboundEmail({
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        from,
        replyTo,
        provider: email.provider,
        mode: "smtp",
        error: null,
        meta: { ...(input.meta ?? {}), smtpMessageId: info.messageId },
      });

      return {
        success: true,
        delivered: true,
        mode: "smtp",
        messageId: info.messageId,
        outboxId: record.id,
        error: null,
        record,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP send failed";
      const record = recordOutboundEmail({
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        from,
        replyTo,
        provider: email.provider,
        mode: "failed",
        error: message,
        meta: input.meta,
      });
      return {
        success: false,
        delivered: false,
        mode: "failed",
        outboxId: record.id,
        error: message,
        record,
      };
    }
  }

  // Demo / staging without SMTP: durable outbox so flows are testable.
  const record = recordOutboundEmail({
    to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    from,
    replyTo,
    provider: email.provider,
    mode: "outbox",
    error: null,
    meta: {
      ...(input.meta ?? {}),
      note: "Stored in outbox — configure SMTP in Platform Settings to deliver to inboxes",
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.info(`[email:outbox] → ${to} | ${input.subject} | id=${record.id}`);
  }

  return {
    success: true,
    delivered: false,
    mode: "outbox",
    outboxId: record.id,
    error: null,
    record,
  };
}
