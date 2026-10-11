import { generateId } from "@/lib/security/crypto";
import { getUserById } from "@/lib/data/auth-identity-store";
import { readCgiDb } from "@/services/cgi/store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { listEnrollmentsForCourse, readCoursesDb } from "@/services/courses/store";

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
  const studentsByCourse = new Map<string, Set<string>>();
  for (const row of readCgiDb().lectureAssignments) {
    if (row.instructorId !== instructorUserId || !row.studentId || row.status === "cancelled") {
      continue;
    }
    const students = studentsByCourse.get(row.courseId) ?? new Set<string>();
    students.add(row.studentId);
    studentsByCourse.set(row.courseId, students);
  }

  return [...studentsByCourse.entries()]
    .flatMap(([courseId, studentIds]) =>
      listEnrollmentsForCourse(courseId)
        .filter((enrollment) => studentIds.has(enrollment.studentId))
        .filter((enrollment) => !["dropped", "rejected"].includes(enrollment.status))
        .flatMap((enrollment) => {
          const student = getUserById(enrollment.studentId);
          if (!student || isFixtureEmail(student.email)) return [];
          const name =
            [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email;
          return [
            {
              id: enrollment.id || generateId(),
              studentId: enrollment.studentId,
              studentName: name,
              studentEmail: student.email,
              courseId: enrollment.courseId,
              courseTitle: courseTitle(courseId),
              status: enrollment.status,
              progressPercent: 0,
              enrolledAt: enrollment.enrolledAt,
            },
          ];
        }),
    )
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));
}
