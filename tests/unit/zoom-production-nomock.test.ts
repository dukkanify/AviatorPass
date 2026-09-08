import { afterEach, describe, expect, it } from "vitest";

import { ClassValidationError } from "@/services/classes/validation";
import {
  createMeetingForClass,
  getZoomCredentialInventory,
  isMockZoomAllowed,
} from "@/services/classes/zoom-service";
import type { LiveClass } from "@/types/classes";

const ORIGINAL_ENV = { ...process.env };

function sampleClass(): LiveClass {
  const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
  return {
    id: "cls_prod_nomock",
    title: "Production Zoom check",
    description: "Must not fall back to mock",
    courseId: null,
    moduleId: null,
    lessonId: null,
    instructorId: "instructor_missing",
    assistantInstructorId: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    timezone: "Asia/Kuwait",
    maxStudents: 10,
    meetingType: "meeting",
    status: "scheduled",
    zoomMeetingId: null,
    recurringRuleId: null,
    parentClassId: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    createdById: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("production Zoom mock ban", () => {
  it("lists credential names without values", () => {
    process.env.ZOOM_CLIENT_ID = "present";
    delete process.env.ZOOM_ACCOUNT_ID;
    const inventory = getZoomCredentialInventory();
    expect(inventory.clientId).toBe(true);
    expect(inventory.accountId).toBe(false);
  });

  it("rejects mock meetings when production runtime is set", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.ALLOW_ZOOM_MOCK;
    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    expect(isMockZoomAllowed()).toBe(false);
    await expect(createMeetingForClass({ liveClass: sampleClass() })).rejects.toBeInstanceOf(
      ClassValidationError,
    );
  });
});
