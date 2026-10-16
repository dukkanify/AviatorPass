import { beforeEach, describe, expect, it } from "vitest";

import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import {
  getStudentAssessmentStats,
  listStudentAssessmentPercents,
} from "@/services/mock-exams/assessment-scores";
import { resetMockExamsDbCache, writeMockExamsDb } from "@/services/mock-exams/store";

describe("mock exam assessment scores", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    resetMockExamsDbCache();
    writeMockExamsDb((db) => {
      db.attempts = [];
      db.sessions = [];
    });
  });

  it("returns zeros when the student has no scored attempts", () => {
    const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT)!;
    const stats = getStudentAssessmentStats(student.id);
    expect(stats.attemptCount).toBe(0);
    expect(stats.averageScore).toBe(0);
    expect(listStudentAssessmentPercents(student.id)).toEqual([]);
  });

  it("averages written attempt percents for live reports", () => {
    const student = readAuthDb().users.find((u) => u.role === ROLES.STUDENT)!;
    const now = new Date().toISOString();
    writeMockExamsDb((db) => {
      db.attempts.push({
        id: "att-1",
        examTypeId: "exam-atpl",
        examTypeName: "ATPL",
        studentId: student.id,
        questionIds: ["q1"],
        answers: {},
        status: "submitted",
        startedAt: now,
        submittedAt: now,
        expiresAt: now,
        timeLimitMinutes: 60,
        score: 8,
        maxScore: 10,
        percent: 80,
        passed: true,
        attemptNumber: 1,
        createdAt: now,
        updatedAt: now,
      });
      db.attempts.push({
        id: "att-2",
        examTypeId: "exam-atpl",
        examTypeName: "ATPL",
        studentId: student.id,
        questionIds: ["q1"],
        answers: {},
        status: "submitted",
        startedAt: now,
        submittedAt: now,
        expiresAt: now,
        timeLimitMinutes: 60,
        score: 6,
        maxScore: 10,
        percent: 60,
        passed: false,
        attemptNumber: 2,
        createdAt: now,
        updatedAt: now,
      });
    });

    const stats = getStudentAssessmentStats(student.id);
    expect(stats.attemptCount).toBe(2);
    expect(stats.averageScore).toBe(70);
    expect(stats.highestScore).toBe(80);
    expect(stats.lowestScore).toBe(60);
    expect(stats.passedCount).toBe(1);
    expect(stats.passRate).toBe(50);
  });
});
