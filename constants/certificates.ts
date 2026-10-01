/**
 * Certificate & reporting constants.
 */

import type { CertificateStatus } from "@/types/certificates";

export const CERTIFICATE_STATUSES: CertificateStatus[] = [
  "draft",
  "pending_approval",
  "issued",
  "revoked",
  "expired",
  "reissued",
];

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  issued: "Issued",
  revoked: "Revoked",
  expired: "Expired",
  reissued: "Reissued",
};

export const CERTIFICATE_TEMPLATE_FIELDS = [
  "studentName",
  "courseName",
  "instructorName",
  "completionDate",
  "issueDate",
  "certificateNumber",
  "verificationCode",
  "organizationName",
] as const;

export const DEFAULT_CERTIFICATE_BODY = `
<div class="centerpiece">
  <p class="brand">{{organizationName}}</p>
  <p class="eyebrow">Certificate of Completion</p>
  <p class="recipient">This certifies that</p>
  <h2>{{studentName}}</h2>
  <p class="body">has successfully completed</p>
  <h3>{{courseName}}</h3>
  <p class="meta">Instructor {{instructorName}} · Completed {{completionDate}}</p>
  <p class="number">Certificate No. {{certificateNumber}}</p>
</div>
`.trim();
