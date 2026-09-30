"use client";

import * as React from "react";
import { Clock, Play, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { csrfHeaders } from "@/lib/security/browser-csrf";
import type { MockExamType, WrittenExamAttempt } from "@/types/mock-exams";

type CatalogRow = {
  examType: MockExamType;
  questionCount: number;
  remainingAttempts: number;
  attempts: WrittenExamAttempt[];
};

type QuestionView = {
  id: string;
  stem: string;
  order: number;
  options: Array<{ id: string; label: string }>;
  explanation: string | null;
  correctOptionId: string | null;
};

async function apiGet<T>(query: string): Promise<T> {
  const res = await fetch(`/api/mock-exams${query}`, { cache: "no-store" });
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

async function apiPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/mock-exams", {
    method: "POST",
    headers: { "content-type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

function remainingLabel(expiresAt: string) {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MockExamWrittenView() {
  const [catalog, setCatalog] = React.useState<CatalogRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState<WrittenExamAttempt | null>(null);
  const [questions, setQuestions] = React.useState<QuestionView[]>([]);
  const [index, setIndex] = React.useState(0);
  const [tick, setTick] = React.useState("");

  const load = React.useCallback(async () => {
    const rows = await apiGet<CatalogRow[]>("?view=written");
    setCatalog(rows);
  }, []);

  React.useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  const submit = React.useCallback(async () => {
    if (!attempt) return;
    try {
      const data = await apiPost<{ attempt: WrittenExamAttempt; questions: QuestionView[] }>({
        action: "submit_written",
        attemptId: attempt.id,
      });
      setAttempt(data.attempt);
      setQuestions(data.questions);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    }
  }, [attempt, load]);

  React.useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const timer = window.setInterval(() => {
      setTick(remainingLabel(attempt.expiresAt));
      if (Date.parse(attempt.expiresAt) <= Date.now()) {
        void submit();
      }
    }, 1000);
    setTick(remainingLabel(attempt.expiresAt));
    return () => window.clearInterval(timer);
  }, [attempt, submit]);

  async function start(examTypeId: string) {
    try {
      const data = await apiPost<{ attempt: WrittenExamAttempt; questions: QuestionView[] }>({
        action: "start_written",
        examTypeId,
      });
      setAttempt(data.attempt);
      setQuestions(data.questions);
      setIndex(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to start");
    }
  }

  async function choose(questionId: string, optionId: string) {
    if (!attempt) return;
    setAttempt((prev) =>
      prev ? { ...prev, answers: { ...prev.answers, [questionId]: optionId } } : prev,
    );
    try {
      const next = await apiPost<WrittenExamAttempt>({
        action: "save_written",
        attemptId: attempt.id,
        questionId,
        optionId,
      });
      setAttempt(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (attempt) {
    const current = questions[index];
    const done = attempt.status !== "in_progress";
    return (
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{attempt.examTypeName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Attempt {attempt.attemptNumber} · {questions.length} questions
            </p>
          </div>
          <Badge variant={done ? (attempt.passed ? "default" : "destructive") : "secondary"}>
            {done ? (
              <span className="inline-flex items-center gap-1">
                <Trophy className="size-3" />
                {attempt.percent}% {attempt.passed ? "Pass" : "Fail"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {tick}
              </span>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {current ? (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Question {index + 1} of {questions.length}
              </p>
              <p className="font-medium">{current.stem}</p>
              <div className="grid gap-2">
                {current.options.map((option) => {
                  const selected = attempt.answers[current.id] === option.id;
                  const correct = done && current.correctOptionId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={done}
                      onClick={() => void choose(current.id, option.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
                        correct
                          ? "border-emerald-500 bg-emerald-500/10"
                          : selected
                            ? "border-[#143048] bg-muted"
                            : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {done && current.explanation ? (
                <p className="text-sm text-muted-foreground">{current.explanation}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={index >= questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
            {!done ? (
              <Button onClick={() => void submit()}>Submit exam</Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setAttempt(null);
                  setQuestions([]);
                }}
              >
                Back to papers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {catalog
          .filter((row) => row.questionCount > 0)
          .map((row) => (
            <Card key={row.examType.id}>
              <CardHeader>
                <CardTitle className="font-display text-xl">{row.examType.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{row.examType.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  {row.questionCount} questions · {row.examType.durationMinutes} min ·{" "}
                  {row.remainingAttempts} attempts left
                </p>
                <Button
                  disabled={row.remainingAttempts <= 0}
                  onClick={() => void start(row.examType.id)}
                >
                  <Play className="size-4" />
                  Start written mock
                </Button>
                {row.attempts.length ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {row.attempts.map((a) => (
                      <li key={a.id}>
                        Attempt {a.attemptNumber}: {a.status}
                        {a.percent != null ? ` · ${a.percent}%` : ""}
                        {a.passed != null ? (a.passed ? " · Pass" : " · Fail") : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
