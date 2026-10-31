import { describe, expect, it } from "vitest";

import {
  formatHeroClock,
  hourInTimeZone,
  isValidIanaTimeZone,
  resolveHeroLocation,
  timeZoneForCountry,
  weatherForCountry,
} from "@/features/learning/components/student-dashboard/student-dashboard-utils";

describe("hero clock follows location timezone", () => {
  it("maps country codes to the displayed city zone", () => {
    expect(timeZoneForCountry("KW")).toBe("Asia/Kuwait");
    expect(timeZoneForCountry("AE")).toBe("Asia/Dubai");
    expect(timeZoneForCountry("EG")).toBe("Africa/Cairo");
    expect(weatherForCountry("KW").city).toBe("Kuwait City");
    expect(weatherForCountry("EG").city).toBe("Cairo");
    expect(weatherForCountry("EG").timeZone).toBe("Africa/Cairo");
  });

  it("does not show Kuwait City for Egypt students (previous bug)", () => {
    const egypt = resolveHeroLocation({
      countryCode: "EG",
      profileTimeZone: "USA ", // garbage profile value must not win
    });
    expect(egypt.city).toBe("Cairo");
    expect(egypt.country).toBe("Egypt");
    expect(egypt.timeZone).toBe("Africa/Cairo");
    expect(isValidIanaTimeZone("USA ")).toBe(false);
    expect(isValidIanaTimeZone("Africa/Cairo")).toBe(true);
  });

  it("formats Kuwait local time, not UTC browser wall clock", () => {
    // 2026-10-31 12:09 UTC → 15:09 Asia/Kuwait (UTC+3), 16:09 Asia/Dubai (UTC+4)
    const utc = new Date("2026-10-31T12:09:00.000Z");
    const kuwait = formatHeroClock(utc, "Asia/Kuwait");
    const dubai = formatHeroClock(utc, "Asia/Dubai");
    const cairo = formatHeroClock(utc, "Africa/Cairo");
    expect(kuwait).toMatch(/31/);
    expect(kuwait).toMatch(/Oct/);
    expect(kuwait).toMatch(/2026/);
    expect(kuwait.toLowerCase()).toMatch(/3:09\s*pm/);
    expect(dubai.toLowerCase()).toMatch(/4:09\s*pm/);
    expect(cairo.toLowerCase()).toMatch(/2:09\s*pm/);
    expect(kuwait).not.toEqual(dubai);
  });

  it("uses location hour for greeting", () => {
    const utc = new Date("2026-10-31T12:09:00.000Z");
    expect(hourInTimeZone(utc, "Asia/Kuwait")).toBe(15);
    expect(hourInTimeZone(utc, "Asia/Dubai")).toBe(16);
    expect(hourInTimeZone(utc, "Africa/Cairo")).toBe(14);
    expect(hourInTimeZone(utc, "UTC")).toBe(12);
  });
});
