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
  writeOpsLog({
    level: failed ? "error" : "info",
    category: failed ? "error" : "job",
    message: event.replace(/_/g, " "),
    details: { event, ...details },
    path: "services/email",
    userId: userId ?? null,
  });
}
