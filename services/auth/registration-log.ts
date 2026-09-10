import { writeOpsLog, type OpsLogLevel } from "@/services/ops/logging-service";

export function logRegistrationEvent(
  event: string,
  details: Record<string, unknown>,
  level: OpsLogLevel = "info",
) {
  writeOpsLog({
    level,
    category: level === "error" ? "error" : "security",
    message: event,
    details,
    path: "services/auth/registration",
  });
  const line = `[registration] ${event}`;
  if (level === "error") console.error(line, details);
  else if (level === "warn") console.warn(line, details);
  else console.info(line, details);
}
