"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CERTIFICATE_STATUS_LABELS, CERTIFICATE_STATUSES } from "@/constants/certificates";
import { certJson } from "@/features/certificates/lib/api";
import type { Certificate, CertificateStatus } from "@/types/certificates";

type CertificateEditDialogProps = {
  certificate: Certificate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function CertificateEditDialog({
  certificate,
  open,
  onOpenChange,
  onSaved,
}: CertificateEditDialogProps) {
  const [studentName, setStudentName] = React.useState("");
  const [certificateNumber, setCertificateNumber] = React.useState("");
  const [courseName, setCourseName] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("");
  const [status, setStatus] = React.useState<CertificateStatus>("issued");
  const [instructorName, setInstructorName] = React.useState("");
  const [verificationCode, setVerificationCode] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!certificate) return;
    setStudentName(certificate.studentName);
    setCertificateNumber(certificate.certificateNumber);
    setCourseName(certificate.courseName);
    setIssueDate(certificate.issueDate?.slice(0, 10) ?? "");
    setStatus(certificate.status);
    setInstructorName(certificate.instructorName);
    setVerificationCode(certificate.verificationCode);
  }, [certificate]);

  async function save() {
    if (!certificate) return;
    setSaving(true);
    const result = await certJson<Certificate>(`/api/certificates/${certificate.id}`, "PATCH", {
      studentName,
      certificateNumber,
      courseName,
      issueDate: issueDate || null,
      status,
      instructorName,
      verificationCode,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Unable to save certificate");
      return;
    }
    toast.success("Certificate updated");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit certificate</DialogTitle>
          <DialogDescription>
            Update student, course, verification, and issue details. Changing the verification code
            regenerates the production QR URL.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cert-student">Student name</Label>
            <Input
              id="cert-student"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cert-number">Certificate number</Label>
            <Input
              id="cert-number"
              value={certificateNumber}
              onChange={(e) => setCertificateNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cert-code">Verification code</Label>
            <Input
              id="cert-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cert-course">Course</Label>
            <Input
              id="cert-course"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cert-issued">Issue date</Label>
            <Input
              id="cert-issued"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CertificateStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERTIFICATE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CERTIFICATE_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cert-instructor">Instructor</Label>
            <Input
              id="cert-instructor"
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
            />
          </div>
          {certificate ? (
            <p className="sm:col-span-2 break-all text-xs text-muted-foreground">
              QR URL: {certificate.qrPayload}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CertificateEditDialog };
