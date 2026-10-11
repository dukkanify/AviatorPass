import { generateId } from "@/lib/security/crypto";
import { getUserById } from "@/lib/data/auth-identity-store";
import { readCgiDb } from "@/services/cgi/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { readCoursesDb } from "@/services/courses/store";

export type InstructorStudentRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: string;
  progressPercent: number;
  enrolledAt: string;
};

function isFixtureEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(".test");
}

/** Students TKI assigned to this instructor for a live ATPL lecture. */
export function listInstructorStudents(instructorUserId: string): InstructorStudentRow[] {
  ensureCoursesSeeded();
  const coursesDb = readCoursesDb();
  const courseTitle = (id: string) => coursesDb.courses.find((c) => c.id === id)?.title ?? "Course";
  const seen = new Set<string>();

  return readCgiDb()
    .lectureAssignments.filter(
      (row) =>
        row.instructorId === instructorUserId &&
        Boolean(row.studentId) &&
        row.status !== "cancelled",
    )
    .flatMap((row) => {
      const studentId = row.studentId as string;
      const key = `${studentId}:${row.courseId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const student = getUserById(studentId);
      if (!student || isFixtureEmail(student.email)) return [];
      const name =
        [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email;
      return [
        {
          id: row.id || generateId(),
          studentId,
          studentName: name,
          studentEmail: student.email,
          courseId: row.courseId,
          courseTitle: courseTitle(row.courseId),
          status: row.status,
          progressPercent: 0,
          enrolledAt: row.scheduledAt ?? row.createdAt,
        },
      ];
    })
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));
}
