"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { classFetch } from "@/features/classes/lib/api";

function MarkSubjectCompleteButton({
  liveClassId,
  studentId,
  onCompleted,
}: {
  liveClassId: string;
  studentId: string;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  async function complete() {
    setSaving(true);
    const result = await classFetch<{ subjectTitle: string | null }>(
      `/api/classes/${liveClassId}/actions`,
      {
        method: "POST",
        body: JSON.stringify({ action: "complete_subject", studentId }),
      },
    );
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not mark this subject complete");
      return;
    }
    toast.success(
      result.data?.subjectTitle
        ? `${result.data.subjectTitle} is complete and will not open again.`
        : "This subject is complete and will not open again.",
    );
    router.refresh();
    onCompleted?.();
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-9"
      disabled={saving}
      onClick={() => void complete()}
    >
      {saving ? "Saving…" : "Mark subject complete"}
    </Button>
  );
}

export { MarkSubjectCompleteButton };
