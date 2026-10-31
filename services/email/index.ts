export {
  sendEmail,
  isEmailDeliveryConfigured,
  isUnverifiedResendDomainError,
  RESEND_ONBOARDING_MAILBOX,
  type SendEmailInput,
  type SendEmailResult,
} from "@/services/email/mailer";
export {
  listOutboundEmails,
  getLatestOutboundTo,
  recordOutboundEmail,
  type OutboundEmailRecord,
} from "@/services/email/outbox";
export {
  dispatchEmailEvent,
  dispatchRoleAlert,
  getEmailAutomationOverview,
  configureAutomationEvent,
  emailRegistrationWelcome,
  emailPaymentUpdate,
  emailScheduleLifecycle,
  EmailAutomationError,
  EMAIL_AUTOMATION_CATALOG,
} from "@/services/email/automation-service";
export {
  isEmailSuppressed,
  upsertSuppression,
  listSuppressions,
  findSuppression,
  type SuppressionEntry,
} from "@/services/email/suppression-store";
export {
  claimEmailIdempotency,
  scheduleEmailIdempotencyKey,
  reminderEmailIdempotencyKey,
  otpEmailIdempotencyKey,
} from "@/services/email/idempotency-store";
export {
  verifyResendWebhookSignature,
  processResendWebhookEvent,
} from "@/services/email/resend-webhook";
