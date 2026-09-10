/**
 * Outbound email mailer — Resend, then SMTP, then durable outbox.
 * Failed production sends are queued for automatic retry.
 */

import nodemailer from "nodemailer";

import { getPlatformSettings } from "@/services/settings/settings-service";
import { logEmailEvent } from "@/services/email/email-log";
import {
  isRetryableEmailError,
  recordOutboundEmail,
  retryBackoffIso,
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
  return Boolean(email.smtpHost?.trim() && email.senderEmail?.trim());
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isEmailDeliveryConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

/** Resend allows this From address without a verified custom domain. */
export const RESEND_ONBOARDING_MAILBOX = "beth.t@example.com";

export function isUnverifiedResendDomainError(error: string | null | undefined): boolean {
  if (!error) return false;
  const text = error.toLowerCase();
  return text.includes("domain is not verified") || text.includes("not a verified domain");
}

function resendOnboardingFrom(displayName: string): string {
  return `${displayName} <${RESEND_ONBOARDING_MAILBOX}>`;
}

function isProductionRuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
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
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.name || `Resend HTTP ${res.status}`);
  }
  return json;
}

function failedRecordFields(error: string, isRetry = false) {
  const retryable = isRetryableEmailError(error) && !isRetry;
  return {
    attempts: 1,
    maxAttempts: 5,
    queueStatus: retryable ? ("queued" as const) : ("dead" as const),
    nextRetryAt: retryable ? retryBackoffIso(1) : null,
    error,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const settings = getPlatformSettings();
  const email = settings.email;
  const to = input.to.trim();
  const from = `${email.senderName || settings.general.platformName} <${email.senderEmail}>`;
  const replyTo = email.replyToEmail || email.senderEmail;
  const isRetry = Boolean(input.meta?.retryOf);

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
      ...failedRecordFields("Missing recipient", isRetry),
      meta: input.meta,
    });
    logEmailEvent("email_failed", { to: "", subject: input.subject, error: "Missing recipient" });
    return {
      success: false,
      delivered: false,
      mode: "failed",
      outboxId: record.id,
      error: "Missing recipient",
      record,
    };
  }

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
      ...failedRecordFields("Email notifications disabled in platform settings", isRetry),
      meta: input.meta,
    });
    logEmailEvent("email_failed", {
      to,
      subject: input.subject,
      error: "Email notifications disabled in platform settings",
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

  const errors: string[] = [];

  if (resendConfigured()) {
    const displayName = email.senderName || settings.general.platformName;
    const fromAttempts: { from: string; fallback: boolean }[] = [{ from, fallback: false }];
    const fallbackFrom = resendOnboardingFrom(displayName);
    if (!from.toLowerCase().includes(RESEND_ONBOARDING_MAILBOX)) {
      fromAttempts.push({ from: fallbackFrom, fallback: true });
    }

    for (const attempt of fromAttempts) {
      try {
        const info = await sendViaResend({
          from: attempt.from,
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
          from: attempt.from,
          replyTo,
          provider: "resend",
          mode: "resend",
          error: null,
          queueStatus: "none",
          meta: {
            ...(input.meta ?? {}),
            resendId: info.id,
            ...(attempt.fallback
              ? { resendFromFallback: true, resendFallbackReason: "custom_domain_unverified" }
              : {}),
          },
        });
        console.info("[email:resend]", {
          to,
          subject: input.subject,
          messageId: info.id,
          from: attempt.from,
          fallback: attempt.fallback,
        });
        logEmailEvent(
          "email_sent",
          {
            to,
            subject: input.subject,
            mode: "resend",
            outboxId: record.id,
            resendId: info.id,
            resendFromFallback: attempt.fallback,
          },
          typeof input.meta?.userId === "string" ? input.meta.userId : null,
        );
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
        console.error("[email:resend]", { to, subject: input.subject, error: message });
        errors.push(message);
        const tryFallback = !attempt.fallback && isUnverifiedResendDomainError(message);
        if (!tryFallback) break;
      }
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
        queueStatus: "none",
        meta: { ...(input.meta ?? {}), smtpMessageId: info.messageId },
      });
      console.info("[email:smtp]", {
        to,
        subject: input.subject,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      });
      logEmailEvent("email_sent", {
        to,
        subject: input.subject,
        mode: "smtp",
        outboxId: record.id,
        smtpMessageId: info.messageId,
        smtpResponse: info.response,
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
      console.error("[email:smtp]", { to, subject: input.subject, error: message });
      errors.push(message);
    }
  }

  if (errors.length) {
    const message = errors.join(" · ");
    const record = recordOutboundEmail({
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from,
      replyTo,
      provider: resendConfigured() ? "resend" : email.provider,
      mode: "failed",
      ...failedRecordFields(message, isRetry),
      meta: input.meta,
    });
    logEmailEvent(
      "email_failed",
      {
        to,
        subject: input.subject,
        error: message,
        outboxId: record.id,
        queued: record.queueStatus,
      },
      typeof input.meta?.userId === "string" ? input.meta.userId : null,
    );
    if (record.queueStatus === "queued") {
      logEmailEvent("email_queued", { outboxId: record.id, nextRetryAt: record.nextRetryAt });
    }
    return {
      success: false,
      delivered: false,
      mode: "failed",
      outboxId: record.id,
      error: message,
      record,
    };
  }

  if (isProductionRuntime()) {
    const message = "SMTP/Resend not configured — production cannot store OTP in the outbox";
    const record = recordOutboundEmail({
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from,
      replyTo,
      provider: email.provider,
      mode: "failed",
      ...failedRecordFields(message, isRetry),
      meta: input.meta,
    });
    logEmailEvent("email_failed", { to, subject: input.subject, error: message });
    return {
      success: false,
      delivered: false,
      mode: "failed",
      outboxId: record.id,
      error: message,
      record,
    };
  }

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
    queueStatus: "none",
    meta: {
      ...(input.meta ?? {}),
      note: "Stored in outbox — configure SMTP or Resend to deliver to inboxes",
    },
  });

  console.info(`[email:outbox] → ${to} | ${input.subject} | id=${record.id}`);
  logEmailEvent("email_sent", { to, subject: input.subject, mode: "outbox", outboxId: record.id });

  return {
    success: true,
    delivered: false,
    mode: "outbox",
    outboxId: record.id,
    error: null,
    record,
  };
}
