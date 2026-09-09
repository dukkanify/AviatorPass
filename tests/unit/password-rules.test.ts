import { describe, expect, it } from "vitest";

import {
  PASSWORD_REQUIREMENTS,
  passwordMeetsAllRequirements,
  passwordRequirementState,
  passwordsMatch,
  passwordStrength,
} from "@/utils/password-rules";

describe("password rules", () => {
  it("lists the five live requirements", () => {
    expect(PASSWORD_REQUIREMENTS.map((rule) => rule.label)).toEqual([
      "Minimum 8 characters",
      "One uppercase letter",
      "One lowercase letter",
      "One number",
      "One special character",
    ]);
  });

  it("turns each requirement on independently", () => {
    expect(passwordRequirementState("Abcdefg1")).toMatchObject({
      length: true,
      upper: true,
      lower: true,
      number: true,
      special: false,
    });
    expect(passwordMeetsAllRequirements("Abcdefg1")).toBe(false);
    expect(passwordMeetsAllRequirements("Abcdefg1!")).toBe(true);
  });

  it("maps strength to Weak, Fair, Good, and Strong", () => {
    expect(passwordStrength("").label).toBe("Weak");
    expect(passwordStrength("a").label).toBe("Weak");
    expect(passwordStrength("aB").label).toBe("Fair");
    expect(passwordStrength("abC1").label).toBe("Good");
    expect(passwordStrength("Abcdefg1!").label).toBe("Strong");
    expect(passwordStrength("Abcdefg1!").bars).toBe(4);
  });

  it("detects matching confirmation", () => {
    expect(passwordsMatch("Abcdefg1!", "Abcdefg1!")).toBe(true);
    expect(passwordsMatch("Abcdefg1!", "Abcdefg1")).toBe(false);
    expect(passwordsMatch("Abcdefg1!", "")).toBe(false);
  });
});
