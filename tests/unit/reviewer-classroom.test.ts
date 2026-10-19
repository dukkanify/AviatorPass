import { describe, expect, it } from "vitest";

import {
  REVIEWER_CLASS_TITLE,
  assessReviewerClassroom,
  selectReviewerClass,
} from "@/services/zoom/reviewer-classroom";
import type { LiveClass } from "@/types/classes";

function cls(
  partial: Partial<LiveClass> & Pick<LiveClass, "id" | "instructorId" | "title">,
): LiveClass {
  return {
    description: "",
    courseId: null,
    moduleId: null,
    lessonId: null,
    assistantInstructorId: null,
    startsAt: "2026-10-19T10:00:00.000Z",
    endsAt: "2026-10-19T10:30:00.000Z",
    durationMinutes: 30,
    timezone: "Asia/Kuwait",
    maxStudents: 2,
    meetingType: "meeting",
    status: "scheduled",
    zoomMeetingId: null,
    recurringRuleId: null,
    parentClassId: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    createdById: null,
    createdAt: "2026-10-19T09:00:00.000Z",
    updatedAt: "2026-10-19T09:00:00.000Z",
    deletedAt: null,
    ...partial,
  };
}

describe("reviewer classroom guard", () => {
  it("blocks creation until a personal Zoom account is authorized", () => {
    const result = assessReviewerClassroom({
      instructorFound: true,
      studentFound: true,
      personalZoomReady: false,
      sharedPlatformAccount: false,
      zoomEmail: null,
      protectedEmails: ["ceo@aviatorpass.com"],
    });
    expect(result.ready).toBe(false);
    expect(result.block).toBe("oauth_not_connected");
  });

  it("rejects the shared platform host and another account email", () => {
    expect(
      assessReviewerClassroom({
        instructorFound: true,
        studentFound: true,
        personalZoomReady: false,
        sharedPlatformAccount: true,
        zoomEmail: "ceo@aviatorpass.com",
        protectedEmails: [],
      }).block,
    ).toBe("shared_platform_zoom");

    expect(
      assessReviewerClassroom({
        instructorFound: true,
        studentFound: true,
        personalZoomReady: true,
        sharedPlatformAccount: false,
        zoomEmail: "student@aviatorpass.com",
        protectedEmails: ["student@aviatorpass.com"],
      }).block,
    ).toBe("customer_zoom_email");
  });

  it("allows a dedicated Zoom user that is not another AviatorPass account", () => {
    const result = assessReviewerClassroom({
      instructorFound: true,
      studentFound: true,
      personalZoomReady: true,
      sharedPlatformAccount: false,
      zoomEmail: "reviewer.host@example.com",
      protectedEmails: ["ceo@aviatorpass.com", "student@aviatorpass.com"],
    });
    expect(result.ready).toBe(true);
    expect(result.zoomEmail).toBe("reviewer.host@example.com");
  });

  it("selects only the reviewer instructor class and ignores customer classes", () => {
    const customer = cls({
      id: "customer-class",
      instructorId: "customer-instructor",
      title: REVIEWER_CLASS_TITLE,
    });
    const reviewer = cls({
      id: "reviewer-class",
      instructorId: "reviewer-instructor",
      title: REVIEWER_CLASS_TITLE,
      createdAt: "2026-10-19T09:30:00.000Z",
    });
    const other = cls({
      id: "other-reviewer-class",
      instructorId: "reviewer-instructor",
      title: "Some other class",
    });
    const selected = selectReviewerClass(
      [customer, other, reviewer],
      new Map([["reviewer-class", ["student-1"]]]),
      "reviewer-instructor",
      "student-1",
    );
    expect(selected?.id).toBe("reviewer-class");
  });
});
