import { describe, expect, it } from "vitest";

import {
  firstPasswordIssue,
  hasPasswordSpecialCharacter,
  PASSWORD_REQUIREMENTS,
  PASSWORD_SPECIAL_CHARACTERS,
  PASSWORD_SPECIAL_ERROR,
  passwordIssues,
  passwordMeetsAllRequirements,
  passwordRequirementState,
  passwordsMatch,
  passwordStrength,
} from "@/utils/password-rules";
import { passwordSchema } from "@/utils/validation";

const ACCEPTED_PASSWORDS = [
  "Password123!",
  "Test@2026",
  "Pilot#123",
  "ATPL$Pass2026",
  "Hello_World1!",
];

const SPECIAL_SAMPLES = [...PASSWORD_SPECIAL_CHARACTERS];

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

  it("accepts the documented special characters", () => {
    for (const ch of SPECIAL_SAMPLES) {
      expect(hasPasswordSpecialCharacter(`Password1${ch}`)).toBe(true);
      expect(passwordMeetsAllRequirements(`Password1${ch}`)).toBe(true);
      expect(passwordSchema.safeParse(`Password1${ch}`).success).toBe(true);
    }
  });

  it("does not treat spaces as a special character", () => {
    expect(hasPasswordSpecialCharacter("Password 123")).toBe(false);
    expect(firstPasswordIssue("Password 123")?.id).toBe("special");
  });

  it("never reports a special-character error when one is present", () => {
    for (const password of ACCEPTED_PASSWORDS) {
      expect(hasPasswordSpecialCharacter(password)).toBe(true);
      expect(passwordIssues(password).some((issue) => issue.id === "special")).toBe(false);
      expect(passwordSchema.safeParse(password).success).toBe(true);
      expect(passwordMeetsAllRequirements(password)).toBe(
        passwordSchema.safeParse(password).success,
      );
    }
  });

  it("keeps frontend and backend password policy identical", () => {
    const samples = [
      ...ACCEPTED_PASSWORDS,
      "Password123",
      "password123!",
      "PASSWORD123!",
      "Password!",
      "Pass1!",
      "short",
      "",
    ];
    for (const password of samples) {
      expect(passwordMeetsAllRequirements(password)).toBe(
        passwordSchema.safeParse(password).success,
      );
    }
  });

  it("rejects invalid passwords with the matching rule only", () => {
    expect(firstPasswordIssue("Pass1!")?.id).toBe("length");
    expect(firstPasswordIssue("password123!")?.id).toBe("upper");
    expect(firstPasswordIssue("PASSWORD123!")?.id).toBe("lower");
    expect(firstPasswordIssue("Password!")?.id).toBe("number");
    expect(firstPasswordIssue("Password123")?.message).toBe(PASSWORD_SPECIAL_ERROR);
    expect(passwordSchema.safeParse("Password123").error?.issues[0]?.message).toBe(
      PASSWORD_SPECIAL_ERROR,
    );
    expect(passwordSchema.safeParse("Password123!").success).toBe(true);
  });
});
