"use client";

import { AtplSubjectManager } from "@/features/courses/components/atpl-subject-manager";

export default function SuperAdminAtplSubjectsPage() {
  return <AtplSubjectManager basePath="/super-admin/courses" roleLabel="Super Admin" />;
}
