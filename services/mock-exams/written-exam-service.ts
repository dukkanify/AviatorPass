/**
 * Self-paced written mock exams — questions, timer, submit, attempts, persisted results.
 * Independent from the retired Quizzes module and from live examiner bookings.
 */

import { generateId } from "@/lib/security/crypto";
import { findUserById } from "@/services/auth/store";
import {
  ensureMockExamsSeeded,
  readMockExamsDb,
  writeMockExamsDb,
} from "@/services/mock-exams/store";
import type { WrittenExamAttempt, WrittenExamQuestion } from "@/types/mock-exams";
import type { UserProfile } from "@/types";

const PASS_PERCENT = 70;
const MAX_ATTEMPTS = 3;

export class WrittenExamError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WrittenExamError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function defaultQuestions(): WrittenExamQuestion[] {
  const bank: Array<Omit<WrittenExamQuestion, "id">> = [
    {
      examTypeId: "me_atpl_full",
      stem: "What does ATIS stand for?",
      options: [
        { id: "a", label: "Automatic Terminal Information Service" },
        { id: "b", label: "Air Traffic Information System" },
        { id: "c", label: "Airport Terminal Instrument Service" },
        { id: "d", label: "Aviation Traffic Identification Signal" },
      ],
      correctOptionId: "a",
      order: 1,
      explanation: "ATIS is the Automatic Terminal Information Service.",
    },
    {
      examTypeId: "me_atpl_full",
      stem: "Standard sea-level atmospheric pressure is:",
      options: [
        { id: "a", label: "1013.25 hPa" },
        { id: "b", label: "1000.00 hPa" },
        { id: "c", label: "29.00 inHg" },
        { id: "d", label: "950.00 hPa" },
      ],
      correctOptionId: "a",
      order: 2,
      explanation: "ISA sea-level pressure is 1013.25 hPa.",
    },
    {
      examTypeId: "me_atpl_full",
      stem: "VFR flight in Class C airspace requires:",
      options: [
        { id: "a", label: "ATC clearance" },
        { id: "b", label: "No radio contact" },
        { id: "c", label: "Only a flight plan" },
        { id: "d", label: "Night rating only" },
      ],
      correctOptionId: "a",
      order: 3,
      explanation: "Class C requires an ATC clearance for all flights.",
    },
    {
      examTypeId: "me_atpl_full",
      stem: "The stalling angle of attack is primarily a function of:",
      options: [
        { id: "a", label: "Wing design / aerofoil" },
        { id: "b", label: "True airspeed only" },
        { id: "c", label: "Engine thrust only" },
        { id: "d", label: "Altitude only" },
      ],
      correctOptionId: "a",
      order: 4,
      explanation: "Stall AoA is set by the aerofoil and configuration.",
    },
    {
      examTypeId: "me_atpl_full",
      stem: "Magnetic variation is the angle between:",
      options: [
        { id: "a", label: "True north and magnetic north" },
        { id: "b", label: "Magnetic north and compass north" },
        { id: "c", label: "True north and grid north" },
        { id: "d", label: "Heading and track" },
      ],
      correctOptionId: "a",
      order: 5,
      explanation: "Variation is true north versus magnetic north.",
    },
    {
      examTypeId: "me_atpl_subject",
      stem: "ICAO Annex 3 covers:",
      options: [
        { id: "a", label: "Meteorological Service for International Air Navigation" },
        { id: "b", label: "Rules of the Air" },
        { id: "c", label: "Aircraft Nationality and Registration Marks" },
        { id: "d", label: "Aerodromes" },
      ],
      correctOptionId: "a",
      order: 1,
      explanation: "Annex 3 is meteorological service.",
    },
    {
      examTypeId: "me_atpl_subject",
      stem: "A METAR is typically issued:",
      options: [
        { id: "a", label: "Hourly, with SPECI as required" },
        { id: "b", label: "Once per day" },
        { id: "c", label: "Only after accidents" },
        { id: "d", label: "Every 12 hours" },
      ],
      correctOptionId: "a",
      order: 2,
      explanation: "METARs are routine hourly reports, plus SPECI.",
    },
    {
      examTypeId: "me_atpl_subject",
      stem: "CB in a TAF indicates:",
      options: [
        { id: "a", label: "Cumulonimbus" },
        { id: "b", label: "Cirrostratus" },
        { id: "c", label: "Broken cloud" },
        { id: "d", label: "Calm winds" },
      ],
      correctOptionId: "a",
      order: 3,
      explanation: "CB is cumulonimbus.",
    },
    {
      examTypeId: "me_progress",
      stem: "QNH is:",
      options: [
        { id: "a", label: "Altimeter setting to read elevation at the airfield" },
        { id: "b", label: "Standard pressure 1013 hPa" },
        { id: "c", label: "Height above ground" },
        { id: "d", label: "Cabin pressure" },
      ],
      correctOptionId: "a",
      order: 1,
      explanation: "QNH makes the altimeter read airfield elevation on the ground.",
    },
    {
      examTypeId: "me_progress",
      stem: "A transponder code 7700 means:",
      options: [
        { id: "a", label: "General emergency" },
        { id: "b", label: "Radio failure" },
        { id: "c", label: "Hijack" },
        { id: "d", label: "VFR" },
      ],
      correctOptionId: "a",
      order: 2,
      explanation: "7700 is emergency, 7600 radio fail, 7500 unlawful interference.",
    },
    {
      examTypeId: "me_elp",
      stem: "Choose the clearest radio phrase for a go-around:",
      options: [
        { id: "a", label: "Going around" },
        { id: "b", label: "I will try again maybe" },
        { id: "c", label: "Not landing now" },
        { id: "d", label: "Wait" },
      ],
      correctOptionId: "a",
      order: 1,
      explanation: "Standard phraseology is “Going around”.",
    },
    {
      examTypeId: "me_elp",
      stem: "“Roger” means:",
      options: [
        { id: "a", label: "I have received all of your last transmission" },
        { id: "b", label: "I will comply" },
        { id: "c", label: "Say again" },
        { id: "d", label: "Unable" },
      ],
      correctOptionId: "a",
      order: 2,
      explanation: "Roger acknowledges receipt, not necessarily compliance.",
    },
  ];

  return bank.map((q, index) => ({
    ...q,
    id: `wq_${q.examTypeId}_${index + 1}`,
  }));
}

export function ensureWrittenExamsSeeded() {
  ensureMockExamsSeeded();
  writeMockExamsDb((db) => {
    db.questions ??= [];
    db.attempts ??= [];
    const defaults = defaultQuestions();
    for (const question of defaults) {
      if (!db.questions.some((row) => row.id === question.id)) {
        db.questions.push(question);
      }
    }
  });
}

export function listWrittenQuestions(examTypeId: string): WrittenExamQuestion[] {
  ensureWrittenExamsSeeded();
  return readMockExamsDb()
    .questions.filter((q) => q.examTypeId === examTypeId)
    .sort((a, b) => a.order - b.order);
}

export function listWrittenAttempts(studentId?: string, examTypeId?: string): WrittenExamAttempt[] {
  ensureWrittenExamsSeeded();
  return readMockExamsDb()
    .attempts.filter(
      (a) =>
        (!studentId || a.studentId === studentId) && (!examTypeId || a.examTypeId === examTypeId),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getWrittenAttempt(id: string): WrittenExamAttempt | null {
  ensureWrittenExamsSeeded();
  return readMockExamsDb().attempts.find((a) => a.id === id) ?? null;
}

function expireIfNeeded(attempt: WrittenExamAttempt): WrittenExamAttempt {
  if (attempt.status !== "in_progress") return attempt;
  if (Date.parse(attempt.expiresAt) > Date.now()) return attempt;
  return gradeAttempt(attempt.id, attempt.answers, "expired");
}

function publicQuestions(attempt: WrittenExamAttempt, reveal: boolean) {
  const all = readMockExamsDb().questions;
  return attempt.questionIds
    .map((id) => all.find((q) => q.id === id))
    .filter(Boolean)
    .map((q) => ({
      id: q!.id,
      stem: q!.stem,
      order: q!.order,
      options: q!.options,
      explanation: reveal ? q!.explanation : null,
      correctOptionId: reveal ? q!.correctOptionId : null,
    }));
}

export function getWrittenCatalog(user: UserProfile) {
  ensureWrittenExamsSeeded();
  const types = readMockExamsDb().examTypes.filter((t) => t.active);
  return types.map((examType) => {
    const questions = listWrittenQuestions(examType.id);
    const attempts = listWrittenAttempts(user.id, examType.id).map(expireIfNeeded);
    return {
      examType,
      questionCount: questions.length,
      attempts,
      remainingAttempts: Math.max(
        0,
        MAX_ATTEMPTS - attempts.filter((a) => a.status !== "in_progress").length,
      ),
    };
  });
}

export function startWrittenAttempt(user: UserProfile, examTypeId: string) {
  ensureWrittenExamsSeeded();
  const examType = readMockExamsDb().examTypes.find((t) => t.id === examTypeId && t.active);
  if (!examType) throw new WrittenExamError("Exam type not found", 404);

  const existing = listWrittenAttempts(user.id, examTypeId).map(expireIfNeeded);
  const active = existing.find((a) => a.status === "in_progress");
  if (active) {
    return { attempt: active, questions: publicQuestions(active, false) };
  }
  const used = existing.filter((a) => a.status !== "in_progress").length;
  if (used >= MAX_ATTEMPTS) {
    throw new WrittenExamError("Maximum attempts reached");
  }

  const questions = listWrittenQuestions(examTypeId);
  if (!questions.length) throw new WrittenExamError("No questions published for this exam", 409);

  const stamp = nowIso();
  const attempt: WrittenExamAttempt = {
    id: generateId(),
    examTypeId,
    examTypeName: examType.name,
    studentId: user.id,
    questionIds: questions.map((q) => q.id),
    answers: {},
    status: "in_progress",
    startedAt: stamp,
    submittedAt: null,
    expiresAt: new Date(Date.now() + examType.durationMinutes * 60_000).toISOString(),
    timeLimitMinutes: examType.durationMinutes,
    score: null,
    maxScore: questions.length,
    percent: null,
    passed: null,
    attemptNumber: used + 1,
    createdAt: stamp,
    updatedAt: stamp,
  };

  writeMockExamsDb((db) => {
    db.attempts.unshift(attempt);
  });

  return { attempt, questions: publicQuestions(attempt, false) };
}

export function saveWrittenAnswer(
  user: UserProfile,
  attemptId: string,
  questionId: string,
  optionId: string,
) {
  const attempt = getWrittenAttempt(attemptId);
  if (!attempt) throw new WrittenExamError("Attempt not found", 404);
  if (attempt.studentId !== user.id) throw new WrittenExamError("Forbidden", 403);
  const live = expireIfNeeded(attempt);
  if (live.status !== "in_progress") throw new WrittenExamError("Attempt is closed");
  if (!live.questionIds.includes(questionId)) throw new WrittenExamError("Unknown question");

  writeMockExamsDb((db) => {
    const row = db.attempts.find((a) => a.id === attemptId);
    if (!row) return;
    row.answers[questionId] = optionId;
    row.updatedAt = nowIso();
  });
  return getWrittenAttempt(attemptId)!;
}

function gradeAttempt(
  attemptId: string,
  answers: Record<string, string>,
  status: "submitted" | "expired",
): WrittenExamAttempt {
  const attempt = getWrittenAttempt(attemptId);
  if (!attempt) throw new WrittenExamError("Attempt not found", 404);
  const questions = readMockExamsDb().questions.filter((q) => attempt.questionIds.includes(q.id));
  let score = 0;
  for (const question of questions) {
    if (answers[question.id] === question.correctOptionId) score += 1;
  }
  const percent = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const stamp = nowIso();
  writeMockExamsDb((db) => {
    const row = db.attempts.find((a) => a.id === attemptId);
    if (!row) return;
    row.answers = answers;
    row.status = status;
    row.submittedAt = stamp;
    row.score = score;
    row.maxScore = questions.length;
    row.percent = percent;
    row.passed = percent >= PASS_PERCENT;
    row.updatedAt = stamp;
  });
  return getWrittenAttempt(attemptId)!;
}

export function submitWrittenAttempt(user: UserProfile, attemptId: string) {
  const attempt = getWrittenAttempt(attemptId);
  if (!attempt) throw new WrittenExamError("Attempt not found", 404);
  if (attempt.studentId !== user.id) throw new WrittenExamError("Forbidden", 403);
  const live = expireIfNeeded(attempt);
  if (live.status !== "in_progress") {
    return { attempt: live, questions: publicQuestions(live, true) };
  }
  const graded = gradeAttempt(attemptId, live.answers, "submitted");
  return { attempt: graded, questions: publicQuestions(graded, true) };
}

export function getWrittenAttemptView(user: UserProfile, attemptId: string) {
  const attempt = getWrittenAttempt(attemptId);
  if (!attempt) throw new WrittenExamError("Attempt not found", 404);
  const isOwner = attempt.studentId === user.id;
  const isStaff = ["super_admin", "admin", "instructor", "chief_ground_instructor"].includes(
    user.role,
  );
  if (!isOwner && !isStaff) throw new WrittenExamError("Forbidden", 403);
  const live = expireIfNeeded(attempt);
  const reveal = live.status !== "in_progress" || isStaff;
  const student = findUserById(live.studentId);
  return {
    attempt: live,
    questions: publicQuestions(live, reveal),
    studentName: student
      ? `${student.firstName} ${student.lastName}`.trim() || student.email
      : null,
  };
}
