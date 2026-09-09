/**
 * Public legal copy for Aviator Pass.
 * British English. Keep in sync with the register form checkboxes.
 */

import { siteStatic } from "@/config/site-static";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export const LEGAL_UPDATED_LABEL = "9 September 2026";

export const TERMS_TITLE = "Terms of Service";
export const TERMS_DESCRIPTION =
  "The rules for creating an Aviator Pass account, verifying your email, and using our aviation training platform.";

export const PRIVACY_TITLE = "Privacy Policy";
export const PRIVACY_DESCRIPTION =
  "How Aviator Pass collects, uses, and protects personal data during registration, verification, and training.";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      `These Terms of Service (“Terms”) govern access to ${siteStatic.name} at https://www.aviatorpass.com (the “Platform”). The Platform is operated by ${siteStatic.legalName}.`,
      `Questions about these Terms: ${siteStatic.contactEmail}. Student support: ${siteStatic.supportEmail}. Training locations we serve include ${siteStatic.locations.join(", ")}.`,
    ],
  },
  {
    heading: "2. Accounts and registration",
    paragraphs: [
      "Student accounts are created through the public registration form, or after a successful course purchase (purchase-first enrolment). Instructor applications are not self-activated from the public form and may require a separate onboarding process.",
      "You must provide accurate details (name, email, phone, country, and nationality), choose a strong password, and accept these Terms and the Privacy Policy. We may refuse, suspend, or close an account that uses false information, impersonates another person, or breaches these Terms.",
    ],
  },
  {
    heading: "3. Email verification codes (OTP)",
    paragraphs: [
      "Registration, sign-in, and some security actions require a one-time verification code sent to your email. Codes expire, are single-use, and must not be shared.",
      "If we cannot deliver the verification email, registration does not complete. Check your inbox and spam folder. If a code does not arrive, use Resend on the verification screen or contact support. You are responsible for using an email address you can access.",
    ],
  },
  {
    heading: "4. Notifications",
    paragraphs: [
      "We send transactional messages that are required to operate your account: verification codes, enrolment confirmations, class reminders, and security notices. Optional product updates are sent only if you opt in during registration or later in notification preferences.",
      "In-app notifications appear in your dashboard after the account exists. You can adjust non-essential preferences once you are signed in.",
    ],
  },
  {
    heading: "5. Courses, live training, and payments",
    paragraphs: [
      "Published course pages describe delivery (live or recorded), pricing, and enrolment. Some programmes, including ATPL theory, use purchase-first checkout: payment is taken before the student account is fully provisioned.",
      "Payments are processed by our payment partners (for example Stripe and, where offered, regional gateways). Fees, taxes, and refund eligibility follow the checkout summary and any programme-specific policy shown before you pay.",
    ],
  },
  {
    heading: "6. Acceptable use",
    paragraphs: [
      "Use the Platform only for lawful aviation education. Do not attempt to bypass security, share accounts, harvest other students’ data, or disrupt live sessions. We may limit or terminate access if we detect abuse, fraud, or a security risk.",
    ],
  },
  {
    heading: "7. Intellectual property",
    paragraphs: [
      "Course materials, branding, software, and content on the Platform belong to Aviator Pass or our licensors. Enrolment grants a personal, non-transferable licence to study the materials for your own training. You may not copy, resell, or republish course content without written permission.",
    ],
  },
  {
    heading: "8. Availability and liability",
    paragraphs: [
      "We aim to keep the Platform available, but live sessions, email delivery, and third-party services (video, payments, hosting) can fail. To the fullest extent permitted by law, Aviator Pass is not liable for indirect or consequential loss, including missed exams arising from downtime or undelivered email.",
      "Nothing in these Terms limits liability that cannot be limited under applicable law, including fraud or death or personal injury caused by negligence.",
    ],
  },
  {
    heading: "9. Changes and governing law",
    paragraphs: [
      "We may update these Terms. The date at the top of this page is the latest version. Continued use after an update means you accept the revised Terms.",
      "These Terms are governed by the laws of the United Arab Emirates, without prejudice to mandatory consumer protections that apply in your country of residence.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Scope",
    paragraphs: [
      `This Privacy Policy explains how ${siteStatic.name} collects and uses personal data when you visit the website, create an account, verify your email, enrol on a course, or contact support.`,
      `Controller contact: ${siteStatic.contactEmail}. Privacy and student support: ${siteStatic.supportEmail}.`,
    ],
  },
  {
    heading: "2. Data we collect",
    paragraphs: ["During registration and account use we typically process:"],
    bullets: [
      "Identity and contact details: first name, last name, email, phone, country, nationality, and timezone.",
      "Account security: password hash (we never store your password in plain text), device label, and one-time verification codes until they expire.",
      "Training and commerce: enrolments, attendance, progress, certificates, invoices, and payment references from our processors (we do not store full card numbers).",
      "Support and operations: messages you send us, and technical logs needed to keep the service secure.",
      "Optional marketing consent if you tick the product-updates box.",
    ],
  },
  {
    heading: "3. How we use data",
    paragraphs: ["We use personal data to:"],
    bullets: [
      "Create and verify your account, including sending the registration one-time code.",
      "Provide courses, live sessions, certificates, and customer support.",
      "Send transactional notifications (email and in-app) that the service cannot run without.",
      "Send optional training tips only where you have consented.",
      "Detect abuse, prevent fraud, and meet legal or aviation-training record requirements.",
    ],
  },
  {
    heading: "4. Email and notifications",
    paragraphs: [
      "Verification and security emails are transactional. They may be sent through our email provider. Until our sending domain is fully authenticated with that provider, messages can come from a provider envelope and may land in spam — please check junk folders during registration.",
      "You can control optional marketing from notification preferences after sign-in. Transactional mail (codes, receipts, class reminders) cannot be fully disabled while you use the Platform.",
    ],
  },
  {
    heading: "5. Sharing",
    paragraphs: [
      "We share data with processors who help us run the Platform: hosting, email delivery, payments, and live video. They may only use the data to provide their service to us. We do not sell your personal data.",
      "We may disclose information if required by law, to protect students or instructors, or in connection with a reorganisation of the business.",
    ],
  },
  {
    heading: "6. Retention and security",
    paragraphs: [
      "We keep account, enrolment, and certificate records for as long as you have an account and for a reasonable period afterwards where we must retain training or tax records. Pending registrations and unused verification codes expire automatically (typically within hours).",
      "Access to admin tools is restricted. No method of transmission is completely secure; please use a unique password and never share your verification code.",
    ],
  },
  {
    heading: "7. Your rights",
    paragraphs: [
      "Depending on where you live, you may ask to access, correct, or delete personal data, or to withdraw optional marketing consent. Email support with the address on your account. Some records (for example issued certificates or invoices) may be retained where the law requires it.",
    ],
  },
  {
    heading: "8. Children",
    paragraphs: [
      "The Platform is intended for adult aviation students and instructors. If you believe a child has created an account, contact support and we will delete it.",
    ],
  },
  {
    heading: "9. Updates",
    paragraphs: [
      `We may update this Policy. The latest version is always published at https://www.aviatorpass.com/legal/privacy. Last updated ${LEGAL_UPDATED_LABEL}.`,
    ],
  },
];
