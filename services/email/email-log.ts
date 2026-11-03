/**
 * Structured email / notification delivery logs for ops.
 */

import { writeOpsLog } from "@/services/ops/logging-service";

export type EmailLogEvent =
  | "email_sent"
  | "email_failed"
  | "email_queued"
  | "email_retry"
  | "email_queue_failure"
  | "notification_created"
  | "notification_delivered"
  | "webhook_trigger";

export function logEmailEvent(
  event: EmailLogEvent,
  details: Record<string, unknown>,
  userId?: string | null,
) {
  const failed = event === "email_failed" || event === "email_queue_failure";
  const errorHint =
    typeof details.error === "string" && details.error.trim()
      ? details.error.trim().slice(0, 160)
      : null;
  const toHint = typeof details.to === "string" ? details.to.trim().slice(0, 80) : null;
  const base = event.replace(/_/g, " ");
  const message = failed
    ? [base, errorHint, toHint ? `to=${toHint}` : null].filter(Boolean).join(" · ")
    : base;
  writeOpsLog({
    level: failed ? "error" : "info",
    category: failed ? "error" : "job",
    message,
    details: { event, ...details },
    path: "services/email",
    userId: userId ?? null,
  });
}
