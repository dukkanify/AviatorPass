import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("notification bell alerts", () => {
  const root = process.cwd();
  const bell = readFileSync(
    path.join(root, "components/notifications/notification-bell.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(root, "styles/notification-bell.css"), "utf8");
  const globals = readFileSync(path.join(root, "styles/globals.css"), "utf8");
  const studentShell = readFileSync(
    path.join(root, "components/layout/student-learning-shell.tsx"),
    "utf8",
  );
  const roleShell = readFileSync(path.join(root, "components/layout/role-shell.tsx"), "utf8");

  it("puts a branded alerts bell in student and role headers", () => {
    expect(studentShell).toContain("NotificationBell");
    expect(roleShell).toContain("NotificationBell");
    expect(bell).toContain("aria-label={label}");
    expect(bell).toContain("Alerts");
    expect(bell).toContain("ap-notify-bell");
    expect(bell).toContain("ap-notify-badge");
    expect(bell).toContain("BellRing");
    expect(bell).toContain("unread alerts");
  });

  it("rings the gold bell when there are unread alerts", () => {
    expect(globals).toContain("./notification-bell.css");
    expect(css).toContain("@keyframes ap-bell-ring");
    expect(css).toContain("@keyframes ap-bell-pulse");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("var(--aviator-gold)");
    expect(bell).toContain('data-unread={unread > 0 ? "true" : "false"}');
  });
});
