/**
 * Email retry queue — failed deliveries are persisted on the outbox and retried.
 * Does not block the originating request.
 */

import { enqueueJob, processQueue } from "@/services/api-platform/queue-service";
import { logEmailEvent } from "@/services/email/email-log";
import { sendEmail, type SendEmailInput } from "@/services/email/mailer";
import {
  getOutboundById,
  listRetryableOutbound,
  retryBackoffIso,
  updateOutboundEmail,
  type OutboundEmailRecord,
} from "@/services/email/outbox";

function toInput(record: OutboundEmailRecord): SendEmailInput {
  return {
    to: record.to,
    subject: record.subject,
    html: record.html,
    text: record.text,
    meta: { ...(record.meta ?? {}), retryOf: record.id, system: true },
  };
}

/** Fire-and-forget send for non-OTP mail. OTP / verification stay on sendEmail. */
export function enqueueEmail(input: SendEmailInput) {
  const job = enqueueJob({
    type: "email",
    payload: {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      meta: input.meta ?? {},
    },
    maxAttempts: 5,
  });
  logEmailEvent("email_queued", { jobId: job.id, to: input.to, subject: input.subject });
  return job;
}

export async function retryFailedOutbound(limit = 10) {
  const rows = listRetryableOutbound(limit);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of rows) {
    const attempts = (row.attempts ?? 1) + 1;
    updateOutboundEmail(row.id, { queueStatus: "retrying", attempts });
    logEmailEvent("email_retry", { outboxId: row.id, attempts, to: row.to });
    const result = await sendEmail(toInput(row));
    if (result.success) {
      updateOutboundEmail(row.id, {
        mode: result.mode,
        error: null,
        queueStatus: "none",
        nextRetryAt: null,
        meta: { ...(row.meta ?? {}), retriedAs: result.outboxId },
      });
      results.push({ id: row.id, ok: true });
      continue;
    }
    const max = row.maxAttempts ?? 5;
    const dead = attempts >= max;
    updateOutboundEmail(row.id, {
      mode: "failed",
      error: result.error,
      attempts,
      queueStatus: dead ? "dead" : "queued",
      nextRetryAt: dead ? null : retryBackoffIso(attempts),
    });
    if (dead) {
      logEmailEvent("email_queue_failure", {
        outboxId: row.id,
        error: result.error,
        attempts,
      });
    }
    results.push({ id: row.id, ok: false, error: result.error ?? "retry failed" });
  }

  return { processed: results.length, results };
}

export async function processEmailQueue(limit = 10) {
  const retries = await retryFailedOutbound(limit);
  const jobs = await processQueue(limit);
  return { retries, jobs };
}

export function getQueuedOutbound(id: string) {
  return getOutboundById(id);
}
