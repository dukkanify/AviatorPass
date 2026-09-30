import { describe, expect, it } from "vitest";

import { atplPackageSubjectTitle } from "@/constants/atpl-complete-package";
import { parseUserAgent, clientContextFromRequest } from "@/lib/ops/client-telemetry";
import { toWebClientUrl } from "@/lib/zoom/web-client";
import { quizzesRemoved } from "@/app/api/quizzes/_gone";
import {
  ensureWrittenExamsSeeded,
  listWrittenQuestions,
  startWrittenAttempt,
  saveWrittenAnswer,
  submitWrittenAttempt,
} from "@/services/mock-exams/written-exam-service";
import { resetMockExamsDbCache, writeMockExamsDb } from "@/services/mock-exams/store";

describe("final meeting fixes", () => {
  it("parses user-agent into device, browser, and OS", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(parsed.device).toBe("Mobile");
    expect(parsed.browser).toBe("Safari");
    expect(parsed.os).toBe("iOS");
  });

  it("reads approximate location from Vercel geo headers", () => {
    const ctx = clientContextFromRequest(
      new Request("https://www.aviatorpass.com/api/admin/activity-logs", {
        headers: {
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
          "x-vercel-ip-city": "Kuwait%20City",
          "x-vercel-ip-country": "KW",
        },
      }),
    );
    expect(ctx.ipAddress).toBe("203.0.113.10");
    expect(ctx.locationLabel).toContain("Kuwait");
    expect(ctx.country).toBe("KW");
  });

  it("converts Zoom join URLs to the in-app web client", () => {
    expect(toWebClientUrl("https://zoom.us/j/123456789?pwd=abc", "123456789", "abc")).toContain(
      "/wc/123456789/join",
    );
  });

  it("maps ATPL course codes to the official subject title", () => {
    expect(atplPackageSubjectTitle("ATPL-050")).toBe("Meteorology");
    expect(atplPackageSubjectTitle("050")).toBe("Meteorology");
  });

  it("returns 410 for retired quiz APIs", async () => {
    const res = quizzesRemoved();
    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/Mock exams/i);
  });

  it("persists written mock exam answers, timer window, and results", () => {
    resetMockExamsDbCache();
    writeMockExamsDb((db) => {
      db.questions = [];
      db.attempts = [];
    });
    ensureWrittenExamsSeeded();
    const questions = listWrittenQuestions("me_progress");
    expect(questions.length).toBeGreaterThan(0);
    const user = {
      id: "stu_test_written",
      email: "student@example.com",
      role: "student",
      fullName: "Test Student",
    } as never;
    const started = startWrittenAttempt(user, "me_progress");
    expect(started.attempt.status).toBe("in_progress");
    expect(started.attempt.expiresAt).toBeTruthy();
    const first = started.questions[0]!;
    saveWrittenAnswer(user, started.attempt.id, first.id, first.options[0]!.id);
    const submitted = submitWrittenAttempt(user, started.attempt.id);
    expect(["submitted", "expired"]).toContain(submitted.attempt.status);
    expect(submitted.attempt.percent).toEqual(expect.any(Number));
    expect(submitted.attempt.score).toEqual(expect.any(Number));
  });
});
