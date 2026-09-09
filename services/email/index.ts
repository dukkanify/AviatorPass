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
