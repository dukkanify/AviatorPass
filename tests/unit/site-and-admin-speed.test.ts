/**
 * Read paths (checkout quote, dashboards, shallow health) must not rewrite
 * stores or hydrate the email outbox on every view.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getClassStats } from "@/services/classes/class-service";
import {
  getEarningsSeries,
  getPlatformOverview,
  getRevenueSeries,
} from "@/services/dashboard/metrics";
import { getHealthSnapshot } from "@/services/ops/health-service";

function src(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("site and admin read-path speed", () => {
  it("does not seed payments on public checkout GET or finance GET lists", () => {
    const checkoutGet = src("app/api/public/checkout/route.ts").split(
      "export async function POST",
    )[0];
    expect(checkoutGet).toMatch(/export async function GET/);
    expect(checkoutGet).not.toMatch(/ensurePaymentsSeeded\(\)/);
    expect(src("app/api/public/checkout/welcome/route.ts")).not.toMatch(/ensurePaymentsSeeded/);
    expect(src("app/api/public/checkout/invoice/route.ts")).not.toMatch(/ensurePaymentsSeeded/);
    expect(src("app/api/payments/reports/route.ts")).not.toMatch(/ensurePaymentsSeeded/);
    expect(src("app/api/payments/invoices/route.ts")).not.toMatch(/ensurePaymentsSeeded/);
    expect(src("app/api/learning/atpl-schedule/route.ts")).not.toMatch(/ensurePaymentsSeeded/);
  });

  it("counts class stats without expanding every row into a list item", () => {
    const body = src("services/classes/class-service.ts");
    const stats = body.slice(body.indexOf("export function getClassStats"));
    expect(stats).not.toMatch(/rows\.map\(toListItem\)/);
    expect(stats).toMatch(/\.slice\(0, 5\)/);
    const counts = getClassStats();
    expect(counts.today).toBeGreaterThanOrEqual(0);
    expect(counts.recentlyUpdated.length).toBeLessThanOrEqual(5);
  });

  it("keeps platform overview and revenue charts read-only after catalog exists", () => {
    const metrics = src("services/dashboard/metrics.ts");
    const overview = metrics.slice(metrics.indexOf("export function getPlatformOverview"));
    expect(overview.slice(0, 400)).not.toMatch(/ensurePaymentsSeeded|ensureAnalyticsSeeded/);
    expect(() => getPlatformOverview()).not.toThrow();
    expect(() => getRevenueSeries()).not.toThrow();
    expect(() => getEarningsSeries()).not.toThrow();
  });

  it("skips the email outbox on shallow health", () => {
    const health = src("services/ops/health-service.ts");
    expect(health).toMatch(/const lastFailed = deep/);
    expect(health).toMatch(/if \(!opts\?\.deep\)/);
    const snap = getHealthSnapshot({ deep: false });
    expect(snap.checks.some((c) => c.id === "app")).toBe(true);
    expect(snap.checks.some((c) => c.id === "database")).toBe(true);
  });
});
