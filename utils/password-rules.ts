export const PASSWORD_REQUIREMENTS = [
  { id: "length", label: "Minimum 8 characters", test: (password: string) => password.length >= 8 },
  {
    id: "upper",
    label: "One uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "lower",
    label: "One lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  { id: "number", label: "One number", test: (password: string) => /[0-9]/.test(password) },
  {
    id: "special",
    label: "One special character",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export type PasswordStrengthLabel = "Weak" | "Fair" | "Good" | "Strong";

export type PasswordRequirementId = (typeof PASSWORD_REQUIREMENTS)[number]["id"];

export function passwordRequirementState(password: string): Record<PasswordRequirementId, boolean> {
  return {
    length: PASSWORD_REQUIREMENTS[0].test(password),
    upper: PASSWORD_REQUIREMENTS[1].test(password),
    lower: PASSWORD_REQUIREMENTS[2].test(password),
    number: PASSWORD_REQUIREMENTS[3].test(password),
    special: PASSWORD_REQUIREMENTS[4].test(password),
  };
}

export function passwordMeetsAllRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((rule) => rule.test(password));
}

export function passwordStrength(password: string): {
  score: number;
  met: number;
  label: PasswordStrengthLabel;
  bars: number;
} {
  const met = PASSWORD_REQUIREMENTS.filter((rule) => rule.test(password)).length;
  if (!password || met <= 1) return { score: 1, met, label: "Weak", bars: password ? 1 : 0 };
  if (met === 2) return { score: 2, met, label: "Fair", bars: 2 };
  if (met <= 4) return { score: 3, met, label: "Good", bars: 3 };
  return { score: 4, met, label: "Strong", bars: 4 };
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
}
