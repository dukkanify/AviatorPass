import { describe, expect, it } from "vitest";

import { evaluateEmailQueueHealth, getHealthSnapshot } from "@/services/ops/health-service";
import { listOpsLogs, writeOpsLog } from "@/services/ops/logging-service";

const configuredBase = {
  emailConfigured: true,
  productionRuntime: true,
  senderEmail: "noreply@aviatorpass.com",
  smtpHost: "",
  hasResendKey: true,
  adminNotificationEmail: "support@aviatorpass.com",
};

describe("health + ops logging", () => {
  it("builds a deep snapshot without throwing", () => {
    const snapshot = getHealthSnapshot({ deep: true });
    expect(snapshot.service).toBe("aviatorpass");
    expect(snapshot.checks.length).toBeGreaterThan(3);
    expect(snapshot.checks.some((c) => c.id === "app")).toBe(true);
    expect(snapshot.checks.some((c) => c.id === "database")).toBe(true);
    const storage = snapshot.checks.find((c) => c.id === "storage");
    expect(storage).toBeTruthy();
    expect(storage?.status).toBe("pass");
    expect(storage?.detail).toMatch(/local|Blob|Supabase/i);
  });

  it("does not fail email_queue on stale outbox unverified-domain rows", () => {
    const check = evaluateEmailQueueHealth({
      ...configuredBase,
      lastFailed: {
        error:
          "The aviatorpass.com domain is not verified. Please, add and verify your domain on https://resend.com/domains · The example.com domain is not verified.",
      },
    });
    expect(check.status).toBe("pass");
    expect(check.detail).toMatch(/Resend API configured/);
    expect(check.detail).not.toMatch(/domain is not verified/i);
  });

  it("ignores the Resend onboarding fallback mailbox when judging domain status", () => {
    const check = evaluateEmailQueueHealth({
      ...configuredBase,
      senderEmail: "beth.t@example.com",
      lastFailed: { error: "The example.com domain is not verified." },
      resend: {
        configured: true,
        apiReachable: true,
        domainVerified: false,
        domainStatus: "not_started",
        senderDomain: "example.com",
        senderEmail: "beth.t@example.com",
        error: "The example.com domain is not verified.",
      },
    });
    expect(check.status).toBe("pass");
  });

  it("passes email_queue when live Resend reports the sender domain verified", () => {
    const check = evaluateEmailQueueHealth({
      ...configuredBase,
      lastFailed: { error: "The aviatorpass.com domain is not verified." },
      resend: {
        configured: true,
        apiReachable: true,
        domainVerified: true,
        domainStatus: "verified",
        senderDomain: "aviatorpass.com",
        senderEmail: "noreply@aviatorpass.com",
        error: null,
      },
    });
    expect(check.status).toBe("pass");
    expect(check.detail).toMatch(/verified/i);
  });

  it("fails email_queue only when live Resend says the current sender is unverified", () => {
    const check = evaluateEmailQueueHealth({
      ...configuredBase,
      lastFailed: null,
      resend: {
        configured: true,
        apiReachable: true,
        domainVerified: false,
        domainStatus: "pending",
        senderDomain: "aviatorpass.com",
        senderEmail: "noreply@aviatorpass.com",
        error: "Resend domain aviatorpass.com status=pending. Copy the DNS records.",
      },
    });
    expect(check.status).toBe("fail");
    expect(check.detail).toMatch(/status=pending/);
  });

  it("warns when Resend is configured but the API is unreachable", () => {
    const check = evaluateEmailQueueHealth({
      ...configuredBase,
      resend: {
        configured: true,
        apiReachable: false,
        domainVerified: false,
        domainStatus: null,
        senderDomain: "aviatorpass.com",
        senderEmail: "noreply@aviatorpass.com",
        error: "Resend API unreachable",
      },
    });
    expect(check.status).toBe("warn");
  });

  it("records ops logs through the memory-backed store", () => {
    const entry = writeOpsLog({
      level: "info",
      category: "application",
      message: "health unit probe",
    });
    expect(entry.id).toBeTruthy();
    const found = listOpsLogs({ q: "health unit probe", limit: 20 }).find((e) => e.id === entry.id);
    expect(found?.message).toBe("health unit probe");
  });
});
