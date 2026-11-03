import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dead route redirects", () => {
  const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

  it("folds marketing aliases into existing surfaces", () => {
    expect(config).toContain('source: "/about"');
    expect(config).toContain('destination: "/"');
    expect(config).toContain('source: "/pricing"');
    expect(config).toContain('destination: "/atpl"');
  });

  it("folds legacy student aliases into the live ATPL journey routes", () => {
    expect(config).toContain('source: "/student/live-classes"');
    expect(config).toContain('destination: "/student/schedule"');
    expect(config).toContain('source: "/student/classes"');
    expect(config).toContain('source: "/student/atpl"');
    expect(config).toContain('destination: "/student/courses"');
    expect(config).toContain('source: "/student/exams"');
    expect(config).toContain('destination: "/student/mock-exams"');
  });
});
