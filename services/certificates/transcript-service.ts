/**
 * Student academic transcript aggregation.
 */

import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { logActivity } from "@/services/auth/activity-log";
import { readAuthDb, toUserProfile } from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { getCourseById } from "@/services/courses/course-service";
import { getCourseLearningState } from "@/services/learning/progress-service";
import { listWrittenAttempts } from "@/services/mock-exams/written-exam-service";
import { listCertificates } from "@/services/certificates/certificate-service";
import { getAcademicPerformance } from "@/services/certificates/progress-service";
import { CertificateError } from "@/services/certificates/access";
import { ensureCertificatesSeeded } from "@/services/certificates/seed";
import type { StudentTranscript } from "@/types/certificates";
import type { UserProfile } from "@/types";

export async function generateTranscript(
  actor: UserProfile,
  studentId: string,
): Promise<StudentTranscript> {
  ensureCertificatesSeeded();
  const student = readAuthDb().users.find((u) => u.id === studentId);
  if (!student) throw new CertificateError("Student not found", 404);
  const profile = toUserProfile(student);
  const performance = getAcademicPerformance(studentId);
  const attempts = listWrittenAttempts(studentId).filter((a) =>
    ["submitted", "expired"].includes(a.status),
  );
  const scored = attempts.filter((a) => typeof a.percent === "number");

  const courses = listStudentEnrollments(studentId)
    .filter((e) => ["approved", "completed", "pending"].includes(e.status))
    .map((e) => {
      const course = getCourseById(e.courseId);
      let progressPercent = 0;
      let completedAt: string | null = null;
      let learningHours = 0;
      try {
        const state = getCourseLearningState(studentId, e.courseId);
        progressPercent = state.progressPercent;
        completedAt = state.completedAt;
        learningHours = Math.round((state.timeSpentSeconds / 3600) * 10) / 10;
      } catch {
        /* skip */
      }
      const courseAttempts = attempts.filter((a) =>
        a.examTypeName.toLowerCase().includes((course?.title ?? "").toLowerCase().slice(0, 8)),
      );
      const quizAvg =
        courseAttempts.length === 0
          ? null
          : Math.round(
              (courseAttempts.reduce((s, a) => s + (a.percent ?? 0), 0) / courseAttempts.length) *
                10,
            ) / 10;
      const cert = listCertificates({
        studentId,
        courseId: e.courseId,
        status: "issued",
      })[0];
      return {
        courseId: e.courseId,
        courseTitle: course?.title ?? e.courseId,
        code: course?.code ?? "",
        progressPercent,
        completed: progressPercent >= 100 || e.status === "completed",
        completedAt,
        learningHours,
        quizAverage: quizAvg,
        certificateNumber: cert?.certificateNumber ?? null,
      };
    });

  const certificates = listCertificates({ studentId }).map((c) => ({
    certificateNumber: c.certificateNumber,
    courseName: c.courseName,
    issueDate: c.issueDate,
    status: c.status,
  }));

  const instructorEvaluations = attempts
    .filter((a) => a.percent != null)
    .map((a) => ({
      courseName: a.examTypeName,
      comment: a.passed ? "Passed written mock exam" : "Written mock exam recorded",
      at: a.updatedAt,
    }));

  const transcript: StudentTranscript = {
    studentId,
    studentName: profile.fullName || profile.email,
    studentEmail: profile.email,
    generatedAt: new Date().toISOString(),
    overallPerformance: performance.averageScore || performance.completionRate,
    learningHours: performance.studyTimeHours,
    attendanceRate: performance.attendanceRate,
    courses,
    certificates,
    quizSummary: {
      attempts: attempts.length,
      averagePercent:
        scored.length === 0
          ? 0
          : Math.round((scored.reduce((s, a) => s + (a.percent ?? 0), 0) / scored.length) * 10) /
            10,
      passRate: performance.passRate,
    },
    instructorEvaluations,
  };

  await logActivity({
    actorId: actor.id,
    action: ACTIVITY_ACTIONS.TRANSCRIPT_GENERATED,
    entityType: "transcript",
    entityId: studentId,
  });

  return transcript;
}
