/**
 * Live assessment results from mock exams (written + examiner-scored sessions).
 * Replaces retired quiz averages in progress / reports / analytics.
 */

import { listWrittenAttempts } from "@/services/mock-exams/written-exam-service";
import { listMockExamSessions } from "@/services/mock-exams/booking-service";

export interface StudentAssessmentStats {
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  attemptCount: number;
  passedCount: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Percent scores from completed written attempts + scored live mock sessions. */
export function listStudentAssessmentPercents(studentId: string): number[] {
  const written = listWrittenAttempts(studentId)
    .filter((a) => ["submitted", "graded", "expired"].includes(a.status))
    .filter((a) => typeof a.percent === "number")
    .map((a) => a.percent as number);

  const live = listMockExamSessions({ studentId })
    .filter((s) => typeof s.scorePercent === "number")
    .map((s) => s.scorePercent as number);

  return [...written, ...live];
}

export function getStudentAssessmentStats(studentId: string): StudentAssessmentStats {
  const percents = listStudentAssessmentPercents(studentId);
  if (percents.length === 0) {
    return {
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      passRate: 0,
      attemptCount: 0,
      passedCount: 0,
    };
  }

  const writtenPassed = listWrittenAttempts(studentId).filter(
    (a) => a.passed === true && ["submitted", "graded", "expired"].includes(a.status),
  ).length;
  const livePassed = listMockExamSessions({ studentId }).filter((s) => s.passed === true).length;
  const passedCount = writtenPassed + livePassed;
  const attemptCount = percents.length;

  return {
    averageScore: round1(percents.reduce((s, n) => s + n, 0) / percents.length),
    highestScore: Math.max(...percents),
    lowestScore: Math.min(...percents),
    passRate: round1((passedCount / attemptCount) * 100),
    attemptCount,
    passedCount,
  };
}

export function countExaminerMockExams(examinerId: string): number {
  return listMockExamSessions({ examinerId }).length;
}
