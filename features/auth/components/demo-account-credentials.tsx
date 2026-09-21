import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_OTP_CODE_DEFAULT,
  PRIMARY_DEMO_EMAILS,
} from "@/constants/demo-accounts";
import { isLiveProductionRuntime } from "@/config/env";
import { demoOtpEnabled } from "@/services/auth/otp-service";

const DEMO_LOGIN_HINTS = [
  { role: "Super Admin", email: PRIMARY_DEMO_EMAILS.superAdmin },
  { role: "Student", email: PRIMARY_DEMO_EMAILS.student },
  { role: "Instructor", email: PRIMARY_DEMO_EMAILS.instructor },
  { role: "CGI", email: PRIMARY_DEMO_EMAILS.cgi },
] as const;

export async function DemoAccountCredentials() {
  if (isLiveProductionRuntime()) return null;
  const showDemoOtp = demoOtpEnabled();

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
        {showDemoOtp ? (
          <>
            {" · "}
            OTP <span className="font-medium text-foreground">{DEMO_OTP_CODE_DEFAULT}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
