import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_OTP_CODE_DEFAULT,
  PRIMARY_DEMO_EMAILS,
} from "@/constants/demo-accounts";

const DEMO_LOGIN_HINTS = [
  { role: "Super Admin", email: PRIMARY_DEMO_EMAILS.superAdmin },
  { role: "Student", email: PRIMARY_DEMO_EMAILS.student },
  { role: "Instructor", email: PRIMARY_DEMO_EMAILS.instructor },
  { role: "CGI", email: PRIMARY_DEMO_EMAILS.cgi },
] as const;

export function DemoAccountCredentials() {
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") return null;

  return (
    <div className="rounded-lg border border-accent/30 bg-muted/40 px-4 py-3 text-left text-xs text-muted-foreground">
      <p className="font-semibold uppercase tracking-[0.16em] text-accent">Demo accounts</p>
      <ul className="mt-2 space-y-1">
        {DEMO_LOGIN_HINTS.map((account) => (
          <li key={account.email}>
            <span className="text-foreground">{account.role}:</span>{" "}
            <span className="font-medium text-foreground">{account.email}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Password <span className="font-medium text-foreground">{DEMO_ACCOUNT_PASSWORD}</span>
        {" · "}
        OTP <span className="font-medium text-foreground">{DEMO_OTP_CODE_DEFAULT}</span>
      </p>
    </div>
  );
}
