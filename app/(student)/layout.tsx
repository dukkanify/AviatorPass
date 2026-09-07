import { StudentLearningShell } from "@/components/layout/student-learning-shell";
import { ROLES } from "@/constants/roles";
import { requirePageRole } from "@/services/auth/guards";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole(ROLES.STUDENT);
  return <StudentLearningShell>{children}</StudentLearningShell>;
}
