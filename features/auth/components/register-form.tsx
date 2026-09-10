"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Eye, EyeOff, GraduationCap, Presentation, X } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { REGISTRATION_COUNTRIES } from "@/constants/countries";
import {
  firstPasswordIssue,
  hasPasswordSpecialCharacter,
  PASSWORD_REQUIREMENTS,
  PASSWORD_SPECIAL_ERROR,
  passwordMeetsAllRequirements,
  passwordsMatch,
  passwordStrength,
} from "@/utils/password-rules";
import { registerSchema } from "@/utils/validation";
import { normalizePhone, sanitizeEmail, sanitizeString } from "@/utils/sanitize";
import { authFetch } from "@/features/auth/services/auth-api";
import { routes } from "@/constants/routes";
import { InstructorComingSoonDialog } from "@/features/auth/components/instructor-coming-soon-dialog";
import { RegistrationPhoneInput } from "@/features/auth/components/registration-phone-input";
import {
  buildRegistrationPhone,
  dialCountryFromRegistrationCountry,
  parseLocalDigitsFromInput,
  type RegistrationDialCountry,
} from "@/utils/registration-phone";

type RegisterRole = "student" | "instructor";

const ROLE_COPY: Record<
  RegisterRole,
  { headline: string; description: string; cta: string; tip: string }
> = {
  student: {
    headline: "Join as a student",
    description: "Learner access to ATPL courses, live Zoom coaching, and exam tools.",
    cta: "Create student account",
    tip: "Best if you are studying for PPL/ATPL theory and want a course path.",
  },
  instructor: {
    headline: "Join as an instructor",
    description: "Teach assigned courses, mentor students, and run live Zoom sessions.",
    cta: "Create instructor account",
    tip: "Instructor accounts may need admin approval before teaching tools unlock.",
  },
};

const FIELD_FOCUS_IDS: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  email: "email",
  phone: "registration-phone-local",
  countryCode: "countryCode",
  nationality: "nationality",
  password: "password",
  confirmPassword: "confirmPassword",
  acceptTerms: "acceptTerms",
  acceptPrivacy: "acceptPrivacy",
};

function focusFirstInvalidField(keys: string[]) {
  for (const key of keys) {
    const id = FIELD_FOCUS_IDS[key];
    if (!id) continue;
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}

function clearFieldError(
  setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  key: string,
) {
  setter((prev) => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
}

function fieldError(
  issues: { path: (string | number)[]; message: string }[],
  key: string,
): string | undefined {
  return issues.find((i) => i.path[0] === key)?.message;
}

function RegisterForm({
  role: initialRole = "student",
  onRoleChange,
  showInstructorComingSoonOnMount = false,
}: {
  role?: RegisterRole;
  onRoleChange?: (role: RegisterRole) => void;
  showInstructorComingSoonOnMount?: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = React.useState<RegisterRole>(initialRole);
  const [instructorModalOpen, setInstructorModalOpen] = React.useState(
    showInstructorComingSoonOnMount,
  );
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phoneDialCountry, setPhoneDialCountry] = React.useState<RegistrationDialCountry>("KW");
  const [phone, setPhone] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("KW");
  const [nationality, setNationality] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = React.useState(false);
  const [marketingConsent, setMarketingConsent] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [passwordBlurred, setPasswordBlurred] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const firstNameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setRole(initialRole === "instructor" ? "student" : initialRole);
  }, [initialRole]);

  React.useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const mapped = dialCountryFromRegistrationCountry(countryCode);
    if (!mapped || mapped === phoneDialCountry) return;
    setPhoneDialCountry(mapped);
    setPhone((prev) => buildRegistrationPhone(mapped, parseLocalDigitsFromInput(mapped, prev)));
  }, [countryCode, phoneDialCountry]);

  const copy = ROLE_COPY.student;
  const strength = passwordStrength(password);
  const passwordValid = passwordMeetsAllRequirements(password);
  const confirmMatches = passwordsMatch(password, confirmPassword);
  const formDraft = {
    email: sanitizeEmail(email),
    firstName: sanitizeString(firstName),
    lastName: sanitizeString(lastName),
    phone: normalizePhone(phone),
    countryCode,
    nationality: sanitizeString(nationality),
    password,
    confirmPassword,
    acceptTerms,
    acceptPrivacy,
    marketingConsent,
    rememberMe,
    role: "student" as const,
    timezone:
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
    language: "en",
    website: honeypot,
  };
  const formReady = registerSchema.safeParse(formDraft).success;
  const canSubmit = formReady && passwordValid && confirmMatches && !pending;
  const revealPasswordError = passwordBlurred || submitAttempted;
  const passwordFieldError =
    revealPasswordError && errors.password
      ? errors.password === PASSWORD_SPECIAL_ERROR && hasPasswordSpecialCharacter(password)
        ? undefined
        : errors.password
      : undefined;

  const syncPasswordError = (value: string, reveal: boolean) => {
    const issue = firstPasswordIssue(value);
    const hideSpecial =
      issue?.id === "special" && hasPasswordSpecialCharacter(value) ? undefined : issue;
    setErrors((prev) => {
      if (!reveal) {
        if (prev.password === PASSWORD_SPECIAL_ERROR && hasPasswordSpecialCharacter(value)) {
          const next = { ...prev };
          delete next.password;
          return next;
        }
        return prev;
      }
      if (!hideSpecial) {
        if (!prev.password) return prev;
        const next = { ...prev };
        delete next.password;
        return next;
      }
      if (prev.password === hideSpecial.message) return prev;
      return { ...prev, password: hideSpecial.message };
    });
  };

  const selectRole = (next: RegisterRole) => {
    if (next === "instructor") {
      setInstructorModalOpen(true);
      return;
    }
    setRole(next);
    onRoleChange?.(next);
  };

  const handlePhoneChange = (e164: string) => {
    setPhone(e164);
    clearFieldError(setErrors, "phone");
  };

  const handlePhoneDialChange = (next: RegistrationDialCountry) => {
    setPhoneDialCountry(next);
    if (next === "KW" && countryCode === "AE") setCountryCode("KW");
    if (next === "AE" && countryCode === "KW") setCountryCode("AE");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "instructor") {
      setInstructorModalOpen(true);
      return;
    }

    setSubmitAttempted(true);
    const parsed = registerSchema.safeParse(formDraft);

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (
          key === "password" &&
          issue.message === PASSWORD_SPECIAL_ERROR &&
          hasPasswordSpecialCharacter(formDraft.password)
        ) {
          continue;
        }
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      focusFirstInvalidField(Object.keys(next));
      const toastMessage = Object.values(next)[0] ?? parsed.error.issues[0]?.message;
      toast.error(toastMessage ?? "Please fix the highlighted fields");
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const result = await authFetch<{
        email: string;
        demoOtp?: string;
        resendAvailableInSeconds?: number;
        verificationEmailSent?: boolean;
        emailDelivery?: "smtp" | "resend" | "outbox" | "failed";
      }>(routes.api.auth.requestOtp, {
        method: "POST",
        body: JSON.stringify({ ...parsed.data, purpose: "register" }),
      });

      if (!result.success) {
        const message = result.error ?? "Unable to start registration";
        const field =
          result.field ||
          (/email/i.test(message) ? "email" : /phone/i.test(message) ? "phone" : undefined);
        if (field) {
          setErrors((prev) => ({ ...prev, [field]: message }));
          focusFirstInvalidField([field]);
        }
        toast.error(message);
        return;
      }

      toast.success("Account created successfully");
      if (result.data?.demoOtp) {
        toast.message(`Demo OTP: ${result.data.demoOtp}`);
      } else if (result.data?.verificationEmailSent !== false) {
        toast.success("Check your inbox and spam folder for the 6-digit code");
      }

      const params = new URLSearchParams({
        email: parsed.data.email,
        purpose: "register",
        role: parsed.data.role,
      });
      if (result.data?.verificationEmailSent === false) {
        params.set("emailFailed", "1");
      }
      router.push(`${routes.verifyEmail}?${params.toString()}`);
    } catch {
      toast.error("Network error. Please retry.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <InstructorComingSoonDialog
        open={instructorModalOpen}
        onOpenChange={setInstructorModalOpen}
      />
      <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
        {/* Honeypot — hidden from users, bots often fill it */}
        <div
          className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden"
          aria-hidden="true"
        >
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium text-foreground">Account type</legend>
          <div
            className="grid grid-cols-2 gap-2 rounded-2xl bg-[rgb(18_36_51_/0.06)] p-1.5"
            role="radiogroup"
            aria-label="Account type"
          >
            {(
              [
                { id: "student" as const, label: "Student", sub: "Learner", icon: GraduationCap },
                {
                  id: "instructor" as const,
                  label: "Instructor",
                  sub: "Teacher",
                  icon: Presentation,
                },
              ] as const
            ).map((option) => {
              const selected = role === option.id;
              const isInstructor = option.id === "instructor";
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={isInstructor || undefined}
                  onClick={() => selectRole(option.id)}
                  className={cn(
                    "flex min-h-[4.25rem] flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-start transition duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "bg-[var(--surface-ink)] text-white shadow-[0_10px_28px_-18px_rgba(11,26,36,0.85)]"
                      : "text-foreground/80 hover:bg-white/70 hover:text-foreground",
                    isInstructor && !selected && "opacity-90",
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Icon className={cn("h-4 w-4", selected ? "text-accent" : "text-primary/80")} />
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-[0.16em]",
                      selected ? "text-white/55" : "text-muted-foreground",
                    )}
                  >
                    {option.sub}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.tip}</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              ref={firstNameRef}
              id="firstName"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                clearFieldError(setErrors, "firstName");
              }}
              autoComplete="given-name"
              placeholder="First name"
              aria-invalid={Boolean(errors.firstName)}
              required
            />
            {errors.firstName ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.firstName}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                clearFieldError(setErrors, "lastName");
              }}
              autoComplete="family-name"
              placeholder="Last name"
              aria-invalid={Boolean(errors.lastName)}
              required
            />
            {errors.lastName ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.lastName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError(setErrors, "email");
            }}
            aria-invalid={Boolean(errors.email)}
            required
          />
          {errors.email ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <RegistrationPhoneInput
          dialCountry={phoneDialCountry}
          onDialCountryChange={handlePhoneDialChange}
          value={phone}
          onChange={handlePhoneChange}
          error={errors.phone}
          disabled={pending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="countryCode">Country</Label>
            <select
              id="countryCode"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              {REGISTRATION_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.countryCode ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.countryCode}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="nationality">Nationality</Label>
            <Input
              id="nationality"
              value={nationality}
              onChange={(e) => {
                setNationality(e.target.value);
                clearFieldError(setErrors, "nationality");
              }}
              autoComplete="country-name"
              placeholder="Nationality"
              aria-invalid={Boolean(errors.nationality)}
              required
            />
            {errors.nationality ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.nationality}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                const next = e.target.value;
                setPassword(next);
                syncPasswordError(next, revealPasswordError);
              }}
              onBlur={() => {
                setPasswordBlurred(true);
                syncPasswordError(password, true);
              }}
              aria-invalid={Boolean(passwordFieldError)}
              aria-describedby="password-requirements password-strength"
              className="pr-10"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div id="password-strength" className="space-y-1.5" aria-live="polite">
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < strength.bars
                      ? strength.label === "Strong"
                        ? "bg-emerald-600"
                        : strength.label === "Good"
                          ? "bg-accent"
                          : strength.label === "Fair"
                            ? "bg-amber-500"
                            : "bg-destructive/80"
                      : "bg-muted",
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Strength:{" "}
              <span
                className={cn(
                  "font-medium",
                  password
                    ? strength.label === "Strong"
                      ? "text-emerald-700"
                      : "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {password ? strength.label : "—"}
              </span>
            </p>
          </div>
          <ul id="password-requirements" className="space-y-1" aria-live="polite">
            {PASSWORD_REQUIREMENTS.map((rule) => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.id}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    met ? "text-emerald-700" : "text-muted-foreground",
                  )}
                >
                  {met ? (
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span>
                    {met ? "✓ " : ""}
                    {rule.label}
                    {rule.id === "special" && !met && "hint" in rule ? (
                      <span className="text-muted-foreground"> ({rule.hint})</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {passwordFieldError ? (
            <p className="text-xs text-destructive" role="alert">
              {passwordFieldError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError(setErrors, "confirmPassword");
              }}
              aria-invalid={
                Boolean(errors.confirmPassword) || (confirmPassword.length > 0 && !confirmMatches)
              }
              className="pr-10"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword ? (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                confirmMatches ? "text-emerald-700" : "text-destructive",
              )}
              role="status"
              aria-live="polite"
            >
              {confirmMatches ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />✓ Passwords match
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Passwords do not match
                </>
              )}
            </p>
          ) : null}
          {errors.confirmPassword ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-border/60 bg-[rgb(18_36_51_/0.03)] p-3.5">
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <Checkbox
              id="acceptTerms"
              checked={acceptTerms}
              onCheckedChange={(v) => {
                setAcceptTerms(v === true);
                clearFieldError(setErrors, "acceptTerms");
              }}
              className="mt-0.5"
              aria-invalid={Boolean(errors.acceptTerms)}
            />
            <span>
              I accept the{" "}
              <Link
                href={routes.legal.terms}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>
            </span>
          </label>
          {errors.acceptTerms ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.acceptTerms}
            </p>
          ) : null}

          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <Checkbox
              id="acceptPrivacy"
              checked={acceptPrivacy}
              onCheckedChange={(v) => {
                setAcceptPrivacy(v === true);
                clearFieldError(setErrors, "acceptPrivacy");
              }}
              className="mt-0.5"
              aria-invalid={Boolean(errors.acceptPrivacy)}
            />
            <span>
              I accept the{" "}
              <Link
                href={routes.legal.privacy}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
            </span>
          </label>
          {errors.acceptPrivacy ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.acceptPrivacy}
            </p>
          ) : null}

          <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Checkbox
              checked={marketingConsent}
              onCheckedChange={(v) => setMarketingConsent(v === true)}
              className="mt-0.5"
            />
            <span>Send me product updates and aviation training tips (optional)</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
            Remember me on this device
          </label>
        </div>

        <Button
          type="submit"
          variant="accent"
          className="hero-cta-primary w-full"
          disabled={!canSubmit}
        >
          {pending ? "Creating secure account..." : copy.cta}
        </Button>
      </form>
    </>
  );
}

export { RegisterForm, ROLE_COPY, fieldError, passwordStrength };
export type { RegisterRole };
